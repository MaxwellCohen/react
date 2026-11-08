'use strict';

// Real-browser comparison of the script path and declarative patching against
// declarative-server.js (see INTEGRATION.md). Needs Chrome and playwright-core:
//
//   PLAYWRIGHT_CORE=<path to playwright-core> CHROME_PATH=<chrome binary> \
//   BROWSER=chromium|firefox|webkit PLAYWRIGHT_BROWSERS_PATH=<dir with firefox/webkit> \
//   node declarative-bench.js heavy|list|error|matrix [port=3011] [n=300] [runs=5] [cpuRate=1]
//
// BROWSER defaults to chromium (CHROME_PATH). heavy/list/error use Chromium-only
// numbers (CDP metrics). matrix works in every browser: per scenario page it runs the
// script path, declarative patching, and declarative patching with the template-for
// polyfill (needs POLYFILL_JS on the server) and reports what the user ends up with.
//
// heavy: layouts, reveal updates/frames, FCP/LCP and bytes for `n` boundaries
//        (script vs declarative with batchMs=0 vs the default 300 ms window).
// list:  SuspenseList forwards/together, script vs declarative: reveal times.
// error: a boundary that errors on the server next to a slow boundary: when is it
//        client rendered.
const http = require('http');
const zlib = require('zlib');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const [, , mode = 'heavy', port = '3011', n = '300', runs = '5', cpu = '1'] =
  process.argv;
const browserName = process.env.BROWSER || 'chromium';
const executablePath =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

function bytes(query) {
  return new Promise(resolve => {
    const chunks = [];
    http.get(`http://localhost:${port}/?${query}`, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        // Drop the shared measurement script so only React's output is compared.
        const html = Buffer.concat(chunks)
          .toString()
          .replace(/<script>\n\(function \(\) \{[\s\S]*?<\/script>/, '');
        resolve({
          raw: html.length,
          gz: zlib.gzipSync(html).length,
          br: zlib.brotliCompressSync(html).length,
        });
      });
    });
  });
}

async function heavy(browser) {
  const variants = [
    ['script', 'mode=script'],
    ['decl batch=0', 'mode=decl&batchMs=0'],
    ['decl batch=300', 'mode=decl'],
  ];
  const res = {};
  for (let round = 0; round < 2; round++) {
    for (const [label, q] of variants) {
      for (let i = 0; i < Number(runs); i++) {
        const ctx = await browser.newContext({
          viewport: {width: 1000, height: 800},
        });
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Performance.enable');
        if (cpu !== '1') {
          await cdp.send('Emulation.setCPUThrottlingRate', {rate: Number(cpu)});
        }
        const errs = [];
        page.on('console', m => m.type() === 'error' && errs.push(m.text()));
        page.on('pageerror', e => errs.push(String(e)));
        await page.goto(
          `http://localhost:${port}/?page=heavy&${q}&n=${n}&clientDelay=0`,
          {waitUntil: 'commit'}
        );
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.fb').length === 0 &&
            document.querySelectorAll('[id^=btn-]').length > 0,
          null,
          {timeout: 20000, polling: 20}
        );
        const allPatched = await page.evaluate(() =>
          Math.round(performance.now())
        );
        await page.waitForTimeout(800);
        const m = await page.evaluate(() => ({
          fcp: window.__paint['first-contentful-paint'],
          lcp: window.__paint.lcp,
          rev: window.__rev,
          rec: (window.__recoverable || []).length,
        }));
        const perf = Object.fromEntries(
          (await cdp.send('Performance.getMetrics')).metrics.map(x => [
            x.name,
            x.value,
          ])
        );
        await page.click('#btn-i' + (Number(n) - 1));
        await page.waitForTimeout(150);
        const ok =
          /:1$/.test(await page.textContent('#btn-i' + (Number(n) - 1))) &&
          errs.length === 0;
        (res[label] ||= []).push({
          ...m,
          allPatched,
          task: Math.round(perf.TaskDuration * 1000),
          layouts: perf.LayoutCount,
          recalcs: perf.RecalcStyleCount,
          layoutMs: Math.round(perf.LayoutDuration * 1000),
          ok,
        });
        await ctx.close();
      }
    }
  }
  console.log(`heavy n=${n} cpu=${cpu}x runs/variant=${res.script.length}`);
  for (const [label, q] of variants) {
    const r = res[label];
    const f = k => med(r.map(x => x[k]));
    const g = k => med(r.map(x => x.rev[k]));
    const by = await bytes(`page=heavy&${q}&n=${n}`);
    console.log(
      `${label.padEnd(15)} bytes=${by.raw} gz=${by.gz} br=${by.br} | fcp=${f('fcp')} lcp=${f('lcp')} ` +
        `firstReveal=${g('first')} lastReveal=${g('last')} allPatched=${f('allPatched')} | ` +
        `updates=${g('calls')} frames=${g('frames')} layouts=${f('layouts')} recalcs=${f('recalcs')} ` +
        `layoutMs=${f('layoutMs')} task=${f('task')} | ok=${r.every(x => x.ok)} recoverable=${r.reduce((a, x) => a + x.rec, 0)}`
    );
  }
}

async function list(browser) {
  for (const order of ['forwards', 'together']) {
    for (const q of ['mode=script', 'mode=decl']) {
      const page = await browser.newPage({viewport: {width: 800, height: 700}});
      const errs = [];
      page.on('console', m => m.type() === 'error' && errs.push(m.text()));
      await page.goto(
        `http://localhost:${port}/?page=list&order=${order}&${q}&clientDelay=0`,
        {waitUntil: 'commit'}
      );
      await page.evaluate(() => {
        window.__gone = {};
        new MutationObserver(() => {
          for (let i = 0; i < 6; i++) {
            if (
              !window.__gone[i] &&
              !document.body.innerText.includes('Loading ' + i) &&
              document.getElementById('content-l' + i)
            ) {
              window.__gone[i] = Math.round(performance.now());
            }
          }
        }).observe(document, {childList: true, subtree: true});
      });
      await page.waitForFunction(
        () => Object.keys(window.__gone).length === 6,
        null,
        {timeout: 15000, polling: 20}
      );
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({
        gone: window.__gone,
        rev: window.__rev,
        rec: window.__recoverable.length,
      }));
      const times = Object.values(r.gone);
      console.log(
        `${order.padEnd(9)} ${q.padEnd(11)} reveal ms: ${Math.min(...times)}..${Math.max(...times)} ` +
          `frames=${r.rev.frames} updates=${r.rev.calls} recoverable=${r.rec} errors=${errs.length}`
      );
      await page.close();
    }
  }
}

async function error(browser) {
  for (const q of ['mode=script', 'mode=decl']) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/?page=error&${q}&clientDelay=0`, {
      waitUntil: 'commit',
    });
    await page.evaluate(() => {
      window.__t = {};
      new MutationObserver(() => {
        if (!window.__t.content && document.getElementById('content-error')) {
          window.__t.content = Math.round(performance.now());
        }
      }).observe(document, {childList: true, subtree: true});
    });
    await page.waitForSelector('#content-error', {timeout: 8000});
    await page.waitForTimeout(2000);
    const t = await page.evaluate(() => window.__t);
    console.log(
      `${q.padEnd(11)} errored boundary client rendered at ${t.content} ms`
    );
    await page.close();
  }
}

// Per scenario: when does the page settle (no fallback left, content present), do the
// counters work (hydration), what errors were reported, which scripts did React ship.
async function matrix(browser) {
  const scenarios = [
    ['basic', 'page=basic', 'a'],
    ['nested', 'page=nested', 'deep'],
    ['css', 'page=css', 'css'],
    ['style', 'page=style', 'style'],
    ['list together', 'page=list&order=together', 'l5'],
    ['error', 'page=error', 'error'],
    ['heavy n=100', 'page=heavy&n=100', 'i99'],
  ];
  const variants = [
    ['script', 'mode=script'],
    ['decl', 'mode=decl'],
    ['decl+polyfill', 'mode=decl&polyfill=1'],
  ];
  const timeout = 6000;
  console.log(`browser=${browserName}`);
  for (const [name, q, last] of scenarios) {
    for (const [label, v] of variants) {
      const ctx = await browser.newContext({
        viewport: {width: 1000, height: 800},
      });
      const page = await ctx.newPage();
      const msgs = [];
      page.on('console', m => {
        if (m.type() === 'error') msgs.push('E:' + m.text().slice(0, 80));
        else if (/polyfill/i.test(m.text()))
          msgs.push('log:' + m.text().slice(0, 60));
      });
      page.on('pageerror', e =>
        msgs.push('PAGEERROR:' + String(e).slice(0, 80))
      );
      await page.goto(`http://localhost:${port}/?${q}&${v}&clientDelay=0`, {
        waitUntil: 'commit',
      });
      const start = Date.now();
      let settled = null;
      try {
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.fb').length === 0 &&
            document.querySelectorAll('[id^=content]').length > 0,
          null,
          {timeout, polling: 25}
        );
        settled = await page.evaluate(() => Math.round(performance.now()));
      } catch (e) {
        settled = null;
      }
      void start;
      await page.waitForTimeout(1500);
      const r = await page.evaluate(last => {
        const btn = document.getElementById('btn-' + last);
        return {
          fallbacksLeft: document.querySelectorAll('.fb').length,
          contentCount: document.querySelectorAll('[id^=content]').length,
          hasBtn: !!btn,
          btnBefore: btn && btn.textContent,
          recoverable: (window.__recoverable || []).map(m => m.slice(0, 60)),
          rev: window.__rev,
          rcScripts: [...document.scripts].filter(x =>
            /\$R[CSX]/.test(x.textContent)
          ).length,
          templatesFor: document.querySelectorAll('template[for]').length,
          markers: (() => {
            const w = document.createTreeWalker(
              document,
              NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION
            );
            let n = 0;
            while (w.nextNode())
              if (
                /^\?(start|end)/.test(
                  w.currentNode.nodeType === 7
                    ? '?' + w.currentNode.target
                    : w.currentNode.data
                )
              )
                n++;
            return n;
          })(),
        };
      }, last);
      let interactive = null;
      if (r.hasBtn) {
        await page.click('#btn-' + last, {timeout: 2000}).catch(() => {});
        await page.waitForTimeout(150);
        interactive = (await page.textContent('#btn-' + last)) !== r.btnBefore;
      }
      console.log(
        `${name.padEnd(14)} ${label.padEnd(14)} settled=${settled === null ? 'NEVER(' + timeout + 'ms)' : settled + 'ms'} ` +
          `reveals=${r.rev.first}..${r.rev.last}ms/${r.rev.calls}upd ` +
          `fallbacksLeft=${r.fallbacksLeft} interactive=${interactive} rcScripts=${r.rcScripts} ` +
          `templatesFor=${r.templatesFor} markersLeft=${r.markers} recoverable=${r.recoverable.length} ` +
          `console=[${msgs.slice(0, 3).join(' | ')}]`
      );
      await ctx.close();
    }
  }
}

(async () => {
  const browser =
    browserName === 'chromium'
      ? await pw.chromium.launch({executablePath, headless: true})
      : await pw[browserName].launch({headless: true});
  await {heavy, list, error, matrix}[mode](browser);
  await browser.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
