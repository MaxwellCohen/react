// node analyze.js  -> prints markdown tables from metrics/scenarios.json and metrics-oldoff/scenarios.json
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync(__dirname + '/metrics/scenarios.json')).rows;
const old = JSON.parse(fs.readFileSync(__dirname + '/metrics-oldoff/scenarios.json')).rows;
const f = n => n.toLocaleString('en-US');
const pct = (v, b) => ((v - b) / b) * 100;
const sp = p => (p > 0 ? '+' : '') + p.toFixed(1) + '%';
const by = (v, id) => rows.find(r => r.variant === v && r.scenario === id);
const ids = [...new Set(rows.map(r => r.scenario))];
const tot = v => ['gzip', 'html', 'flight', 'brotli'].map(k => rows.filter(r => r.variant === v).reduce((n, r) => n + r[k], 0));
const T = {off: tot('off'), registry: tot('registry'), tee: tot('tee')};
console.log('## Totals (' + ids.length + ' pages, full size)\n');
console.log('| variant | gzip download | raw HTML | inlined Flight | brotli |\n|---|---|---|---|---|');
for (const v of ['off', 'registry', 'tee']) {
  const t = T[v];
  console.log('| ' + v + ' | ' + t.map((x, i) => v === 'off' ? f(x) : f(x) + ' (' + sp(pct(x, T.off[i])) + ')').join(' | ') + ' |');
}
for (const v of ['registry', 'tee']) {
  const d = ids.map(id => ({id, p: pct(by(v, id).gzip, by('off', id).gzip), sav: by('off', id).gzip - by(v, id).gzip}));
  const s = d.map(x => x.p).sort((a, b) => a - b);
  const med = (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
  const w1 = d.filter(x => Math.abs(x.p) <= 1), big = d.filter(x => x.p > 1 || (x.p > 0 && Math.abs(x.p) > 1));
  const larger = d.filter(x => x.p > 0);
  console.log('\n### ' + v + ' per-page gzip');
  console.log('- median per-page gzip change: ' + sp(med));
  console.log('- pages within ±1%: ' + w1.length + ' (' + w1.map(x => x.id).join(', ') + ')');
  console.log('- pages larger (gzip>off): ' + larger.length + ' (' + larger.map(x => x.id + ' ' + sp(x.p)).join(', ') + ')');
  const top = d.slice().sort((a, b) => b.sav - a.sav).slice(0, 5);
  console.log('- top-5 savers: ' + top.map(x => x.id + ' ' + f(x.sav) + 'B').join(', ') + ' = ' + (100 * top.reduce((n, x) => n + x.sav, 0) / (T.off[0] - T[v][0])).toFixed(1) + '% of total gzip saved');
}
const w = ['off', 'registry', 'tee'].map(v => by(v, 'wide-tree'));
console.log('\n### wide-tree (largest sample)\n\n| variant | gzip | HTML | inlined Flight | brotli |\n|---|---|---|---|---|');
for (const r of w) console.log('| ' + r.variant + ' | ' + [r.gzip, r.html, r.flight, r.brotli].map(f).join(' | ') + ' |');
console.log('\n### tee vs registry, pages differing >1% in any byte metric\n');
let n = 0;
for (const id of ids) {
  const a = by('registry', id), b = by('tee', id);
  const d = ['gzip', 'html', 'flight', 'brotli'].map(k => [k, pct(b[k], a[k])]);
  if (d.some(([, p]) => Math.abs(p) > 1)) { n++; console.log('- ' + id + ': ' + ['gzip', 'html', 'flight', 'brotli'].map(k => k + ' ' + f(a[k]) + '→' + f(b[k]) + ' (' + sp(pct(b[k], a[k])) + ')').join(', ')); }
}
if (!n) console.log('none');
console.log('\n### off: new build vs old registry-era build (builds-live/off)\n');
let nd = 0;
for (const id of ids) {
  const a = old.find(r => r.scenario === id), b = by('off', id);
  const diff = ['html', 'gzip', 'brotli', 'flight'].filter(k => a[k] !== b[k]);
  if (diff.length) { nd++; console.log('- ' + id + ': ' + diff.map(k => k + ' ' + f(a[k]) + '→' + f(b[k])).join(', ')); }
}
console.log(nd ? '\n' + nd + ' pages differ' : 'identical for all ' + ids.length + ' pages (html, gzip, brotli, flight)');
console.log('\nNon-deterministic: ' + rows.filter(r => !r.bytesDeterministic).map(r => r.scenario + '/' + r.variant).join(', '));
