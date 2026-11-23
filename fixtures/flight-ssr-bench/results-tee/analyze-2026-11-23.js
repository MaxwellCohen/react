// node analyze-2026-11-23.js -> markdown tables: new off/on vs previous tee (results-tee/metrics)
const fs = require('fs');
const load = d =>
  JSON.parse(fs.readFileSync(__dirname + '/' + d + '/scenarios.json')).rows;
const nw = load('metrics-2026-11-23'),
  prev = load('metrics'),
  oldoff = load('metrics-oldoff');
const f = n => n.toLocaleString('en-US');
const sp = p => (p > 0 ? '+' : '') + p.toFixed(1) + '%';
const get = (rows, v, id) =>
  rows.find(r => r.variant === v && r.scenario === id);
const ids41 = [...new Set(prev.map(r => r.scenario))];
const idsAll = [...new Set(nw.map(r => r.scenario))];
const K = ['gzip', 'html', 'flight', 'brotli'];
const tot = (rows, v, ids) =>
  K.map(k => ids.reduce((n, id) => n + get(rows, v, id)[k], 0));
console.log('## Totals, 41 original pages (full size)\n');
console.log(
  '| build | gzip | raw HTML | inlined Flight | brotli |\n|---|---|---|---|---|'
);
const show = (name, t) =>
  console.log('| ' + name + ' | ' + t.map(f).join(' | ') + ' |');
show('previous off (old build)', tot(oldoff, 'off', ids41));
show('previous tee', tot(prev, 'tee', ids41));
show('new off', tot(nw, 'off', ids41));
show('new on', tot(nw, 'all', ids41));
console.log('\n## Totals, all ' + idsAll.length + ' pages\n');
console.log(
  '| build | gzip | raw HTML | inlined Flight | brotli |\n|---|---|---|---|---|'
);
show('new off', tot(nw, 'off', idsAll));
show('new on', tot(nw, 'all', idsAll));
console.log(
  '\n## Pages whose on gzip changed by more than 2% vs previous tee\n'
);
console.log(
  '| page | previous tee gzip | new on gzip | change | new off gzip |\n|---|---|---|---|---|'
);
for (const id of ids41) {
  const a = get(prev, 'tee', id).gzip,
    b = get(nw, 'all', id).gzip;
  if (Math.abs((b - a) / a) > 0.02)
    console.log(
      '| ' +
        id +
        ' | ' +
        f(a) +
        ' | ' +
        f(b) +
        ' | ' +
        sp(((b - a) / a) * 100) +
        ' | ' +
        f(get(nw, 'off', id).gzip) +
        ' |'
    );
}
console.log('\n## Pages where on is larger than off (gzip)\n');
console.log(
  '| page | off gzip | on gzip | change | on raw HTML vs off |\n|---|---|---|---|---|'
);
for (const id of idsAll) {
  const o = get(nw, 'off', id),
    n = get(nw, 'all', id);
  if (n.gzip > o.gzip)
    console.log(
      '| ' +
        id +
        ' | ' +
        f(o.gzip) +
        ' | ' +
        f(n.gzip) +
        ' | ' +
        sp(((n.gzip - o.gzip) / o.gzip) * 100) +
        ' | ' +
        sp(((n.html - o.html) / o.html) * 100) +
        ' |'
    );
}
console.log('\n## New pages (new off vs on gzip)\n');
for (const id of idsAll.filter(i => !ids41.includes(i))) {
  const o = get(nw, 'off', id),
    n = get(nw, 'all', id);
  console.log(
    '- ' +
      id +
      ': off ' +
      f(o.gzip) +
      ', on ' +
      f(n.gzip) +
      ' (' +
      sp(((n.gzip - o.gzip) / o.gzip) * 100) +
      '), inlined Flight ' +
      f(o.flight) +
      ' -> ' +
      f(n.flight)
  );
}
