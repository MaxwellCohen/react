'use strict';

// Size + in-process render-time matrix: scenario x build variant.
// Usage: SCENARIO_BUILDS=<dir> node scenarios-metrics.js [--only a,b] [--size smoke|full] [--builds dir] [--n 30]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {parseArgs, quantile} = require('./scenarios-lib/common');
const {boot} = require('./scenarios-lib/boot');

const FLIGHT_RE = /<script>\(self\.__FLIGHT_DATA[\s\S]*?<\/script>/g;
const pct = (v, base) => (base === 0 ? 0 : ((v - base) / base) * 100);
const fmtPct = p => (p > 0 ? '+' : '') + p.toFixed(1) + '%';

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const smoke = opts.size === 'smoke';
  const N = opts.n || (smoke ? 3 : 30);
  const ctx = await boot(opts, {client: false});
  const rows = [];
  try {
    for (const s of ctx.scenarios) {
      const acc = Object.fromEntries(ctx.workers.map(w => [w.name, {times: [], lens: new Set()}]));
      const bytes = {};
      const run = async (w, record) => {
        const r = await w.call('render', {id: s.id, size: s.size});
        if (r.problems.length) throw new Error(s.id + ' [' + w.name + '] server console output: ' + r.problems[0]);
        const buf = Buffer.from(r.html);
        acc[w.name].lens.add(buf.length);
        if (record) acc[w.name].times.push(r.ms);
        if (!bytes[w.name]) {
          bytes[w.name] = {
            html: buf.length,
            gzip: zlib.gzipSync(buf, {level: 9}).length,
            brotli: zlib.brotliCompressSync(buf, {params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 11}}).length,
            flight: (r.html.match(FLIGHT_RE) || []).reduce((n, x) => n + Buffer.byteLength(x), 0),
          };
        }
      };
      for (let i = 0; i < 2; i++) for (const w of ctx.workers) await run(w, false);
      for (let i = 0; i < N; i++) for (const w of ctx.workers) await run(w, true);
      for (const w of ctx.workers) {
        const t = acc[w.name].times.slice().sort((a, b) => a - b);
        rows.push({
          scenario: s.id,
          category: s.category,
          expectedBenefit: s.expectedBenefit,
          size: s.size,
          variant: w.name,
          ...bytes[w.name],
          bytesDeterministic: acc[w.name].lens.size === 1,
          n: t.length,
          median: quantile(t, 0.5),
          q1: quantile(t, 0.25),
          q3: quantile(t, 0.75),
        });
      }
      process.stdout.write('.');
    }
  } finally {
    ctx.kill();
  }
  console.log('');
  for (const r of rows) {
    const off = rows.find(x => x.scenario === r.scenario && x.variant === 'off');
    r.deltas = {html: pct(r.html, off.html), gzip: pct(r.gzip, off.gzip), brotli: pct(r.brotli, off.brotli), flight: pct(r.flight, off.flight)};
    r.timeRatio = r.median / off.median;
    r.flags = [];
    if (r.variant !== 'off') {
      const timeRegress = r.timeRatio > 1.05 && r.q1 > off.q3;
      if (r.deltas.html > 0.5 || r.deltas.gzip > 0.5 || r.deltas.brotli > 0.5 || timeRegress) r.flags.push('REGRESSION');
      if (Math.abs(r.deltas.gzip) <= 1) r.flags.push('NO-BENEFIT');
      if (r.expectedBenefit === 'high' && r.variant === 'all' && r.deltas.gzip > -1) r.flags.push('EXPECTED-HIGH-GOT-NONE');
    }
    if (!r.bytesDeterministic) r.flags.push('NONDETERMINISTIC-BYTES');
  }
  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, {recursive: true});
  fs.writeFileSync(
    path.join(resultsDir, 'scenarios.json'),
    JSON.stringify({size: opts.size, n: N, builds: opts.builds, variants: opts.variants, rows}, null, 2) + '\n'
  );
  const md = [
    '# Scenario corpus results',
    '',
    `size=${opts.size}, N=${N} interleaved renders per cell, builds=\`${opts.builds}\`. Bytes are deterministic; times are in-process Flight->Fizz render (median ms [Q1-Q3]) and noisy on a shared machine.`,
    'Percentages are vs the flags-off build. REGRESSION: any bytes +0.5% or time ratio >1.05 with non-overlapping IQRs. NO-BENEFIT: gzip change within +-1%.',
    '',
    '| scenario | expected | variant | HTML B | gzip B | brotli B | inlined Flight B | median ms [IQR] | time x off | flags |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const cell = (v, d) => (r.variant === 'off' ? String(v) : `${v} (${fmtPct(d)})`);
    md.push(
      `| ${r.scenario} | ${r.expectedBenefit} | ${r.variant} | ${cell(r.html, r.deltas.html)} | ${cell(r.gzip, r.deltas.gzip)} | ${cell(r.brotli, r.deltas.brotli)} | ${cell(r.flight, r.deltas.flight)} | ${r.median.toFixed(2)} [${r.q1.toFixed(2)}-${r.q3.toFixed(2)}] | ${r.timeRatio.toFixed(2)} | ${r.flags.join(' ')} |`
    );
  }
  fs.writeFileSync(path.join(resultsDir, 'RESULTS-SCENARIOS.md'), md.join('\n') + '\n');
  console.log(md.slice(6).join('\n'));
  const bad = rows.filter(r => r.flags.includes('NONDETERMINISTIC-BYTES'));
  if (bad.length) {
    console.error('Non-deterministic byte counts: ' + bad.map(r => r.scenario + '/' + r.variant).join(', '));
    process.exit(1);
  }
})().catch(e => {
  console.error(process.env.DEBUG ? e : e.message);
  process.exit(1);
});
