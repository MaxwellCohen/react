'use strict';

/**
 * Headless Chrome runner for incrementing-render-effect.
 * Usage:
 *   node scripts/bench/benchmarks/incrementing-render-effect/measure-chrome.js
 *
 * Expects react.production.min.js / react-dom.production.min.js in this directory.
 */

const {spawn} = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const {URL} = require('url');

const DIR = __dirname;
const UPDATES = Number(process.env.UPDATES || 100000);
const RUNS = Number(process.env.RUNS || 10);
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function contentType(filePath) {
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      let filePath = path.join(
        DIR,
        url.pathname === '/' ? 'index.html' : url.pathname
      );
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
        res.writeHead(200, {'Content-Type': contentType(filePath)});
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

async function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id === id) {
        ws.removeEventListener('message', onMessage);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({id, method, params}));
  });
}

async function measureOnce(pageUrl) {
  const debugPort = 9200 + Math.floor(Math.random() * 200);
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`,
      '--user-data-dir=' + path.join(DIR, '.chrome-profile-' + debugPort),
      'about:blank',
    ],
    {stdio: ['ignore', 'ignore', 'ignore']}
  );

  try {
    // Wait for DevTools endpoint
    let wsUrl = null;
    for (let i = 0; i < 50; i++) {
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
      new Promise((resolve, reject) => {
        const id = nextId++;
        const onMessage = event => {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
          if (msg.sessionId === sessionId && msg.id === id) {
            ws.removeEventListener('message', onMessage);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({id, method, params, sessionId}));
      });

    await sessionSend('Runtime.enable');
    await sessionSend('Page.enable');
    await sessionSend('Page.navigate', {url: pageUrl});
    await sessionSend('Page.loadEventFired');

    // Wait for benchmark completion via Runtime.evaluate polling
    const deadline = Date.now() + 120000;
    let duration = null;
    while (Date.now() < deadline) {
      const result = await sessionSend('Runtime.evaluate', {
        expression: `(() => {
          const entries = performance.getEntriesByName('Incrementing Render Effect');
          if (entries.length === 0) return null;
          return entries[entries.length - 1].duration;
        })()`,
        returnByValue: true,
      });
      if (result.result && result.result.value != null) {
        duration = result.result.value;
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    ws.close();
    if (duration == null) throw new Error('Benchmark did not complete');
    return duration;
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
  const reactBundle = path.join(DIR, 'react.production.min.js');
  const reactDomBundle = path.join(DIR, 'react-dom.production.min.js');
  if (!fs.existsSync(reactBundle) || !fs.existsSync(reactDomBundle)) {
    console.error(
      'Missing production bundles in benchmark directory. Build and copy first.'
    );
    process.exit(1);
  }

  // Patch UPDATES into served benchmark by rewriting a temp copy if needed.
  // The source already defaults to 100000; honor UPDATES via query is complex,
  // so rewrite benchmark.js on the fly when UPDATES differs.
  const originalBench = fs.readFileSync(path.join(DIR, 'benchmark.js'), 'utf8');
  const patched = originalBench.replace(
    /const UPDATES = 100000;/,
    `const UPDATES = ${UPDATES};`
  );
  if (patched !== originalBench) {
    fs.writeFileSync(path.join(DIR, 'benchmark.js'), patched);
  }

  const {server, port} = await startServer();
  const pageUrl = `http://127.0.0.1:${port}/`;
  const times = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      const ms = await measureOnce(pageUrl);
      times.push(ms);
      console.log(`run ${i + 1}/${RUNS}: ${ms.toFixed(1)} ms`);
    }
  } finally {
    server.close();
    if (patched !== originalBench) {
      fs.writeFileSync(path.join(DIR, 'benchmark.js'), originalBench);
    }
  }

  const med = median(times);
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(
    JSON.stringify({
      updates: UPDATES,
      runs: RUNS,
      times,
      median: med,
      min,
      max,
    })
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
