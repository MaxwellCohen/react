'use strict';

// Real-browser check: loads each variant in Chromium, asserts hydration adopts
// the server DOM without warnings, client components are interactive, and a
// client-side navigation fetches full content. Prints a JSON result per variant.
// Usage: NODE_ENV=production node e2e/run.js [--rows=1000]
const zlib = require('zlib');
const {chromium} = require('playwright');
const {start} = require('./server');

const ROWS = +(
  process.argv.find(a => a.startsWith('--rows=')) || '=1000'
).split('=')[1];
const PORT = 3003;

async function check(browser, kind) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning')
      logs.push(m.text().slice(0, 300));
  });
  page.on('pageerror', e => logs.push('pageerror: ' + String(e).slice(0, 300)));
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive' && !window.__saved) {
        window.__saved = {
          rows: Array.from(document.querySelectorAll('tr')),
          style: document.querySelector('style'),
          ld: document.querySelector('script[type="application/ld+json"]'),
        };
      }
    });
  });
  let htmlBytes = 0;
  let htmlGzip = 0;
  let flightBytes = 0;
  page.on('response', async r => {
    if (r.request().resourceType() === 'document') {
      const body = await r.body();
      htmlBytes = body.length;
      htmlGzip = zlib.gzipSync(body).length;
      flightBytes = (
        body
          .toString()
          .match(/<script>\(self\.__FLIGHT_DATA[\s\S]*?<\/script>/g) || []
      ).reduce((n, s) => n + s.length, 0);
    }
  });
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/${kind}?rows=${ROWS}`, {
    waitUntil: 'load',
  });
  // Hydrated when clicking the top counter updates it.
  const top = page.locator('button.counter').first();
  let hydratedMs = -1;
  for (let i = 0; i < 200; i++) {
    await top.click();
    if ((await top.textContent()).endsWith(': 1')) {
      hydratedMs = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(50);
  }
  const hydratedAt = await page.evaluate(() => window.__hydratedAt);
  const adopted = await page.evaluate(() => {
    const s = window.__saved;
    const now = Array.from(document.querySelectorAll('tr'));
    return {
      rowsTotal: now.length,
      rowsSameNode: s.rows.filter((r, i) => now[i] === r).length,
      styleSame: document.querySelector('style') === s.style,
      ldSame:
        document.querySelector('script[type="application/ld+json"]') === s.ld,
      recoverable: window.__recoverable || [],
    };
  });
  // Interactive counter in the middle of the table.
  let rowCounterText = 'Row 99: 100';
  if (ROWS >= 100) {
    const rowCounter = page.locator('button.counter', {hasText: 'Row 99:'});
    await rowCounter.click();
    rowCounterText = await rowCounter.textContent();
  }
  // Client-side navigation to a smaller page: full Flight (not elided).
  await page.evaluate(url => window.__navigate(url), `/rsc/${kind}?rows=20`);
  await page.waitForFunction(
    () => document.querySelectorAll('tr').length === 20,
    null,
    {timeout: 10000}
  );
  const afterNav = await page.evaluate(() => ({
    tr: document.querySelectorAll('tr').length,
    firstRow: document.querySelector('tr').textContent.slice(0, 40),
  }));
  await ctx.close();
  return {
    hydratedAt,
    kind,
    rows: ROWS,
    htmlBytes,
    htmlGzip,
    flightInlineBytes: flightBytes,
    hydratedMs,
    adopted,
    rowCounterText,
    afterNav,
    consoleProblems: logs,
  };
}

(async () => {
  const server = await start(PORT);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  });
  let failed = false;
  for (const kind of [
    'baseline',
    'client-rows',
    'server-rows-baseline',
    'html-first-json',
    'html-first',
  ]) {
    const runs = [];
    for (let i = 0; i < 9; i++) runs.push(await check(browser, kind));
    const r = runs[runs.length - 1];
    r.hydratedMsRuns = runs.map(x => x.hydratedMs).sort((a, b) => a - b);
    r.hydratedMs = r.hydratedMsRuns[2];
    r.hydratedAtRuns = runs
      .map(x => Math.round(x.hydratedAt))
      .sort((a, b) => a - b);
    r.hydratedAt = r.hydratedAtRuns[4];
    console.log(JSON.stringify(r));
    const ok =
      r.hydratedMs >= 0 &&
      r.consoleProblems.length === 0 &&
      r.adopted.rowsSameNode === r.adopted.rowsTotal &&
      r.adopted.styleSame &&
      r.adopted.ldSame &&
      r.adopted.recoverable.length === 0 &&
      r.rowCounterText.endsWith(': 100') &&
      r.afterNav.tr === 20;
    if (!ok) {
      failed = true;
      console.error('FAILED:', kind);
    }
  }
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
