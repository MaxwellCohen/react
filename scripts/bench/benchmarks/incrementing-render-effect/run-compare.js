'use strict';

const {spawn} = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const {URL} = require('url');
const esbuild = require('esbuild');

const DIR = __dirname;
const REPO = path.join(DIR, '../../../..');
const BUILD_ROOT = path.join(REPO, 'build/oss-experimental');
const UPDATES = Number(process.env.UPDATES || 100000);
const RUNS = Number(process.env.RUNS || 10);
const LABEL = process.env.LABEL || 'run';
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function bundle() {
  const outfile = path.join(DIR, 'bundle.production.js');
  await esbuild.build({
    entryPoints: [path.join(DIR, 'entry.js')],
    bundle: true,
    outfile,
    platform: 'browser',
    format: 'iife',
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
      'globalThis.__UPDATES__': String(UPDATES),
    },
    alias: {
      react: path.join(BUILD_ROOT, 'react'),
      'react-dom': path.join(BUILD_ROOT, 'react-dom'),
      'react-dom/client': path.join(BUILD_ROOT, 'react-dom/client'),
      scheduler: path.join(BUILD_ROOT, 'scheduler'),
    },
  });
  return outfile;
}

function writeHtml() {
  const html = `<!DOCTYPE html>
<html>
  <body>
    <div id="app"></div>
    <script src="./bundle.production.js"></script>
    <script>
      runBenchmark().then((ms) => {
        window.__BENCH_MS__ = ms;
      }).catch((err) => {
        window.__BENCH_ERROR__ = String(err && err.stack || err);
      });
    </script>
  </body>
</html>`;
  fs.writeFileSync(path.join(DIR, 'measure.html'), html);
}

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = url.pathname === '/' ? '/measure.html' : url.pathname;
      const filePath = path.join(DIR, rel);
      if (!filePath.startsWith(DIR)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end(String(err));
          return;
        }
        const type = filePath.endsWith('.js') ? 'text/javascript' : 'text/html';
        res.writeHead(200, {'Content-Type': type});
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({server, port: server.address().port});
    });
  });
}

async function getWsEndpoint(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  const json = await res.json();
  return json.webSocketDebuggerUrl;
}

function cdpSend(ws, id, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (sessionId && msg.sessionId !== sessionId) return;
      if (msg.id === id) {
        ws.removeEventListener('message', onMessage);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMessage);
    const payload = {id, method, params};
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
  });
}

async function measureOnce(pageUrl) {
  const debugPort = 9300 + Math.floor(Math.random() * 300);
  const profileDir = path.join(DIR, '.chrome-profile-' + debugPort);
  fs.mkdirSync(profileDir, {recursive: true});
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    {stdio: ['ignore', 'ignore', 'pipe']}
  );

  try {
    let wsUrl = null;
    for (let i = 0; i < 80; i++) {
      try {
        wsUrl = await getWsEndpoint(debugPort);
        break;
      } catch {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    if (!wsUrl) throw new Error('Chrome DevTools endpoint not available');

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    let nextId = 1;
    const send = (method, params) => cdpSend(ws, nextId++, method, params);
    const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
    const {sessionId} = await send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const sessionSend = (method, params = {}) =>
      cdpSend(ws, nextId++, method, params, sessionId);

    await sessionSend('Runtime.enable');
    await sessionSend('Page.enable');

    const loadPromise = new Promise((resolve, reject) => {
      const onMessage = event => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (
          msg.sessionId === sessionId &&
          msg.method === 'Page.loadEventFired'
        ) {
          ws.removeEventListener('message', onMessage);
          resolve();
        }
      };
      ws.addEventListener('message', onMessage);
      setTimeout(() => reject(new Error('Page load timeout')), 30000);
    });

    await sessionSend('Page.navigate', {url: pageUrl});
    await loadPromise;

    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const result = await sessionSend('Runtime.evaluate', {
        expression: `({
          ms: window.__BENCH_MS__ ?? null,
          error: window.__BENCH_ERROR__ ?? null
        })`,
        returnByValue: true,
      });
      const value = result.result && result.result.value;
      if (value && value.error) throw new Error(value.error);
      if (value && value.ms != null) {
        ws.close();
        return value.ms;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Benchmark timed out');
  } finally {
    chrome.kill('SIGKILL');
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  if (!fs.existsSync(path.join(BUILD_ROOT, 'react'))) {
    throw new Error('Missing build/oss-experimental. Build NODE_PROD first.');
  }
  await bundle();
  writeHtml();
  const {server, port} = await startServer();
  const pageUrl = `http://127.0.0.1:${port}/measure.html`;
  const times = [];
  try {
    console.log(`[${LABEL}] updates=${UPDATES} runs=${RUNS}`);
    for (let i = 0; i < RUNS; i++) {
      const ms = await measureOnce(pageUrl);
      times.push(ms);
      console.log(`[${LABEL}] run ${i + 1}/${RUNS}: ${ms.toFixed(1)} ms`);
    }
  } finally {
    server.close();
  }
  const result = {
    label: LABEL,
    updates: UPDATES,
    runs: RUNS,
    times,
    median: median(times),
    min: Math.min(...times),
    max: Math.max(...times),
  };
  console.log(JSON.stringify(result));
  fs.writeFileSync(
    path.join(DIR, `results-${LABEL}.json`),
    JSON.stringify(result, null, 2)
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
