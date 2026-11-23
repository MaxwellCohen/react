'use strict';

// Hydration cost: scenario x build variant, real Chromium with CPU throttling.
// Usage: SCENARIO_BUILDS=<dir> node scenarios-hydration.js [--only a,b] [--size smoke|full] [--builds dir] [--n 15] [--throttle 4]
// Per load (fresh context, interleaved across variants):
//   (hydrateRoot is called after the first paint, two rAFs + a task after load, so the paint is outside the window.)
//   hydrateMs  window.__hydrateStart (just before hydrateRoot) -> window.__hydrateEnd (two macrotask turns
//              after the Shell passive effect, which flushes the post-hydration re-render of stubs).
//              The page is already fully parsed, so the window is main-thread bound.
//   busyMs     main-thread busy time (sum of RunTask in a CDP trace) between the hydrate-start and hydrate-end marks:
//              scripts + style/layout/paint, no idle. Idle is where hydrate ms and busyMs differ.
//   scriptMs   CDP Performance.getMetrics ScriptDuration of the whole load (client.js eval + hydration + effects).
// Also reports stubs ($J ids in the inlined Flight), HTML/gzip bytes.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {parseArgs, quantile} = require('./scenarios-lib/common');
const {boot} = require('./scenarios-lib/boot');
const {serve, launchBrowser} = require('./scenarios-lib/browser');

const FLIGHT_RE = /<script>\(self\.__FLIGHT_DATA[\s\S]*?<\/script>/g;

(async () => {
  const argv = process.argv.slice(2);
  let throttle = 4;
  const i = argv.indexOf('--throttle');
  if (i >= 0) throttle = +argv.splice(i, 2)[1];
  const opts = parseArgs(argv);
  const N = opts.n || 15;
  const ctx = await boot(opts, {client: true});
  const pages = {};
  const flights = {};
  const server = await serve(
    pages,
    flights,
    Object.fromEntries(ctx.workers.map(w => [w.name, ctx.dirs[w.name]]))
  );
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await launchBrowser(opts.browser);
  const rows = [];
  const load = async (v, s) => {
    const c = await browser.newContext();
    try {
      const page = await c.newPage();
      const cdp = await c.newCDPSession(page);
      await page.addInitScript(() => {
        window.__SCN_AFTER_PAINT = true;
      });
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: throttle});
      const events = [];
      cdp.on('Tracing.dataCollected', e => events.push(...e.value));
      await cdp.send('Tracing.start', {
        transferMode: 'ReportEvents',
        traceConfig: {
          includedCategories: [
            'disabled-by-default-devtools.timeline',
            'devtools.timeline',
            'blink.user_timing',
          ],
        },
      });
      await page.goto(`${base}/${v}/${s.id}/`, {waitUntil: 'load'});
      await page.waitForFunction(
        () => window.__hydrateEnd !== undefined,
        null,
        {
          timeout: 60000,
        }
      );
      const t = await page.evaluate(() => ({
        hydrateMs: window.__hydrateEnd - window.__hydrateStart,
        toEffectMs: window.__hydratedAt - window.__hydrateStart,
      }));
      const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
      await cdp.send('Tracing.end');
      await done;
      const main = events.find(
        e =>
          e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain'
      );
      const at = n =>
        events.find(
          e => e.name === n && e.pid === main.pid && e.tid === main.tid
        );
      const a = at('hydrate-start').ts;
      const b = at('hydrate-end').ts;
      let busy = 0;
      for (const e of events)
        if (
          e.name === 'RunTask' &&
          e.ph === 'X' &&
          e.pid === main.pid &&
          e.tid === main.tid
        ) {
          const lo = Math.max(e.ts, a);
          const hi = Math.min(e.ts + e.dur, b);
          if (hi > lo) busy += hi - lo;
        }
      t.busyMs = busy / 1000;
      const m = await cdp.send('Performance.getMetrics');
      const get = n => (m.metrics.find(x => x.name === n) || {value: 0}).value;
      t.scriptMs = get('ScriptDuration') * 1000;
      t.taskMs = get('TaskDuration') * 1000;
      return t;
    } finally {
      await c.close();
    }
  };
  try {
    for (const s of ctx.scenarios) {
      const info = {};
      for (const w of ctx.workers) {
        const r = await w.call('render', {id: s.id, size: s.size});
        pages[w.name + '/' + s.id] = r.html;
        const flight = (r.html.match(FLIGHT_RE) || []).join('');
        const buf = Buffer.from(r.html);
        info[w.name] = {
          stubs: (flight.match(/\$J[0-9a-f]+:/g) || []).length,
          html: buf.length,
          gzip: zlib.gzipSync(buf, {level: 9}).length,
        };
      }
      const acc = Object.fromEntries(
        ctx.workers.map(w => [
          w.name,
          {hydrateMs: [], toEffectMs: [], busyMs: [], scriptMs: [], taskMs: []},
        ])
      );
      for (const w of ctx.workers) await load(w.name, s); // warm up
      for (let k = 0; k < N; k++)
        for (const w of ctx.workers) {
          const t = await load(w.name, s);
          for (const key in t) acc[w.name][key].push(t[key]);
        }
      for (const w of ctx.workers) {
        const row = {
          scenario: s.id,
          size: s.size,
          variant: w.name,
          n: N,
          throttle,
          ...info[w.name],
        };
        for (const key in acc[w.name]) {
          const a = acc[w.name][key].slice().sort((x, y) => x - y);
          row[key] = {
            median: quantile(a, 0.5),
            p25: quantile(a, 0.25),
            p75: quantile(a, 0.75),
            min: a[0],
            max: a[a.length - 1],
          };
        }
        rows.push(row);
      }
      process.stdout.write('.');
    }
  } finally {
    await browser.close();
    server.close();
    ctx.kill();
  }
  console.log('');
  const f = x =>
    x.median.toFixed(1) +
    ' [' +
    x.p25.toFixed(1) +
    '-' +
    x.p75.toFixed(1) +
    ']';
  const md = [
    `size=${opts.size}, N=${N} interleaved loads per cell, CPU throttle ${throttle}x, builds=\`${opts.builds}\`.`,
    'hydrate ms = __hydrateStart -> __hydrateEnd (median [p25-p75]); script ms = CDP ScriptDuration of the whole load.',
    '',
    '| scenario | variant | stubs | HTML B | gzip B | hydrate ms | to-effect ms | busy ms | script ms |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows)
    md.push(
      `| ${r.scenario} | ${r.variant} | ${r.stubs} | ${r.html} | ${r.gzip} | ${f(r.hydrateMs)} | ${f(r.toEffectMs)} | ${f(r.busyMs)} | ${f(r.scriptMs)} |`
    );
  const dir = process.env.SCN_RESULTS_DIR || path.join(__dirname, 'results');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'hydration.json'),
    JSON.stringify(
      {size: opts.size, n: N, throttle, builds: opts.builds, rows},
      null,
      2
    ) + '\n'
  );
  fs.writeFileSync(
    path.join(dir, 'RESULTS-HYDRATION.md'),
    md.join('\n') + '\n'
  );
  console.log(md.join('\n'));
})().catch(e => {
  console.error(process.env.DEBUG ? e : e.message);
  process.exit(1);
});
