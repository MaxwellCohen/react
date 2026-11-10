'use strict';

// Real-browser runner: serves pre-rendered pages per variant and drives them.
const http = require('http');
const path = require('path');
const fs = require('fs');
const playwright = require('playwright');

// Launches the browser named by --browser (chromium by default). CHROME_PATH
// stays an override for a local Chromium build; it does not apply to firefox/webkit.
function launchBrowser(name) {
  return playwright[name].launch({executablePath: name === 'chromium' ? process.env.CHROME_PATH || undefined : undefined});
}

function serve(pages, flights, dirs) {
  const server = http.createServer((req, res) => {
    const [, v, a, b] = new URL(req.url, 'http://x').pathname.split('/');
    if (a === 'client.js') {
      res.writeHead(200, {'Content-Type': 'text/javascript'});
      return res.end(fs.readFileSync(path.join(dirs[v], 'build-client/client.js')));
    }
    if (a === 'rsc' && flights[v + '/' + b] !== undefined) {
      res.writeHead(200, {'Content-Type': 'text/x-component'});
      return res.end(flights[v + '/' + b]);
    }
    const html = pages[v + '/' + a];
    if (html !== undefined) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      return res.end(html.replace('</body></html>', `<script src="/${v}/client.js" defer></script></body></html>`));
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

function serialize() {
  const c = document.documentElement.cloneNode(true);
  c.querySelectorAll('script').forEach(s => {
    const t = s.getAttribute('type');
    if (t !== 'application/ld+json' && t !== 'application/json') s.remove();
  });
  // Not user-visible and legitimately differ after an elided region remounts:
  // comment nodes (<!-- --> text separators, Suspense markers), React's
  // render-blocking <template id="_R_..."> marker, split text nodes.
  c.querySelectorAll('template[id^="_R_"]').forEach(t => t.remove());
  const w = document.createTreeWalker(c, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (w.nextNode()) comments.push(w.currentNode);
  comments.forEach(n => n.remove());
  c.normalize();
  return c.outerHTML;
}

async function settle(page) {
  let prev = null;
  let stable = 0;
  const t0 = Date.now();
  while (stable < 4 && Date.now() - t0 < 8000) {
    await page.waitForTimeout(60);
    const cur = await page.evaluate(serialize);
    stable = cur === prev ? stable + 1 : 0;
    prev = cur;
  }
  return prev;
}

async function runSteps(page, steps, size, navUrl) {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const where = 'interact[' + i + '] ' + JSON.stringify(s);
    const cnt = c => (c === 'size' ? size : c);
    try {
      if (s.navigate) {
        await page.evaluate(u => window.__navigate(u), navUrl);
        await settle(page);
      } else if (s.click) await page.locator(s.click).nth(s.nth || 0).click({timeout: 5000});
      else if (s.fill) await page.locator(s.fill).nth(s.nth || 0).fill(s.value, {timeout: 5000});
      else if (s.expectText) {
        const e = s.expectText;
        await page.waitForFunction(
          ([sel, n, t]) => {
            const el = document.querySelectorAll(sel)[n];
            return !!el && el.textContent === t;
          },
          [e.selector, e.nth || 0, e.text],
          {timeout: 5000}
        );
      } else if (s.expectCount) {
        const e = s.expectCount;
        await page.waitForFunction(
          ([sel, n]) => document.querySelectorAll(sel).length === n,
          [e.selector, cnt(e.count)],
          {timeout: 5000}
        );
      }
    } catch (err) {
      let got = '';
      try {
        const e = s.expectText || s.expectCount;
        if (e) got = await page.evaluate(([sel, n]) => {
          const els = document.querySelectorAll(sel);
          return 'matches=' + els.length + (els[n] ? ' text=' + JSON.stringify(els[n].textContent.slice(0, 80)) : '');
        }, [e.selector, e.nth || 0]);
      } catch (e2) {}
      throw new Error(where + ' failed: ' + String(err.message).split('\n')[0] + (got ? ' (' + got + ')' : ''));
    }
  }
}

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const ctx = s => JSON.stringify(s.slice(Math.max(0, i - 60), i + 100));
  return `first difference at char ${i} (lengths ${a.length} vs ${b.length})\n      ref: ${ctx(a)}\n      got: ${ctx(b)}`;
}

// Returns {snaps:{hydrated, interacted, navigated, navInteracted}, failures:[{check, message}]}
async function runPage(browser, base, v, s) {
  const failures = [];
  const fail = (check, message) => failures.push({check, message});
  const snaps = {};
  const open = async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => {
      if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 400));
    });
    page.on('pageerror', e => logs.push('pageerror: ' + String(e).slice(0, 400)));
    await page.goto(`${base}/${v}/${s.id}/`, {waitUntil: 'load'});
    await page.waitForFunction(() => window.__hydratedAt !== undefined, null, {timeout: 10000});
    return {ctx, page, logs};
  };
  const finish = async ({ctx, page, logs}, tag) => {
    const rec = await page.evaluate(() => window.__recoverable || []);
    for (const l of logs) fail('console', tag + ' ' + l);
    if (!s.allowRecoverableErrors) for (const r of rec) fail('hydration', tag + ' recoverable error: ' + r);
    await ctx.close();
  };
  // Page A: hydrate, interact on the adopted DOM.
  let A;
  try {
    A = await open();
    snaps.hydrated = await settle(A.page);
    try {
      await runSteps(A.page, s.interact, s.size, `/${v}/rsc/${s.id}`);
      snaps.interacted = await settle(A.page);
    } catch (e) {
      fail('interact', 'after hydration: ' + e.message);
    }
    await finish(A, '[load]');
  } catch (e) {
    fail('load', e.message.split('\n')[0]);
    if (A) await A.ctx.close().catch(() => {});
    return {snaps, failures};
  }
  // Page B: hydrate, navigate (full Flight), compare, interact again.
  let B;
  try {
    B = await open();
    const before = await settle(B.page);
    await B.page.evaluate(u => window.__navigate(u), `/${v}/rsc/${s.id}`);
    snaps.navigated = await settle(B.page);
    if (snaps.navigated !== before) fail('navigation', 'DOM after full-Flight navigation differs from hydrated DOM: ' + firstDiff(before, snaps.navigated));
    try {
      await runSteps(B.page, s.interact, s.size, `/${v}/rsc/${s.id}`);
      snaps.navInteracted = await settle(B.page);
    } catch (e) {
      fail('interact', 'after navigation: ' + e.message);
    }
    await finish(B, '[nav]');
  } catch (e) {
    fail('navigation', e.message.split('\n')[0]);
    if (B) await B.ctx.close().catch(() => {});
  }
  return {snaps, failures};
}

module.exports = {serve, runPage, firstDiff, launchBrowser};
