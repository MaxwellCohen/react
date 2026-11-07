'use strict';

// Breaks a Flight payload down by row kind and by what the bytes are spent on.
// Usage: NODE_ENV=production node analyze-flight.js [--rows=1000] [--file=x.flight] [--dump=x.flight]
// Without --file it renders TableServer (variant (a) of bench-table.js).

require('@babel/register')({
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
  only: [/\/src\//],
});
const fs = require('fs');
const {PassThrough} = require('stream');

function arg(name, def) {
  const a = process.argv.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : def;
}

async function render(rows) {
  const webpack = require('webpack');
  await new Promise((res, rej) =>
    webpack(require('./webpack.config'), (e, s) =>
      e || s.hasErrors() ? rej(e || new Error(s.toString())) : res()
    )
  );
  const {clientManifest} = require('./webpack-mock');
  const {renderRSCNode, TableServer} = require('./build/rsc-bundle.js');
  const out = new PassThrough();
  const chunks = [];
  out.on('data', c => chunks.push(c));
  await new Promise(r => {
    out.on('end', r);
    renderRSCNode(clientManifest, TableServer, rows).pipe(out);
  });
  return Buffer.concat(chunks);
}

const add = (m, k, n, c = 1) => {
  const e = m.get(k) || {bytes: 0, count: 0};
  e.bytes += n;
  e.count += c;
  m.set(k, e);
};
const len = s => Buffer.byteLength(s);

// Walk a parsed model and attribute serialized bytes.
function walk(v, cat, fields, ctx) {
  if (Array.isArray(v)) {
    if (v[0] === '$' && v.length >= 4) {
      // Element tuple: ["$", type, key, props]
      const type = v[1];
      const isRef = typeof type === 'string' && /^\$L/.test(type);
      const kind = isRef
        ? 'client-ref element'
        : typeof type === 'string' && !type.startsWith('$')
          ? 'host element <' + type + '>'
          : 'other element';
      const tupleOverhead =
        len('["$",,,]') + len(JSON.stringify(type)) + len(JSON.stringify(v[2]));
      add(
        cat,
        'element tuple/type/key: ' + (isRef ? 'client-ref' : 'host'),
        tupleOverhead
      );
      ctx = {...ctx, el: kind};
      add(cat, '#elements ' + kind, 0, 1);
      walk(v[3], cat, fields, ctx);
      return;
    }
    add(cat, 'array brackets/commas', 2 + Math.max(0, v.length - 1));
    v.forEach(x => walk(x, cat, fields, ctx));
    return;
  }
  if (v && typeof v === 'object') {
    add(
      cat,
      'object braces/commas',
      2 + Math.max(0, Object.keys(v).length - 1)
    );
    for (const k of Object.keys(v)) {
      const kb = len(JSON.stringify(k)) + 1;
      add(cat, 'prop names (keys)', kb);
      const before = snapshot(cat);
      walk(v[k], cat, fields, ctx);
      const total = kb + (snapshot(cat) - before);
      add(fields, (ctx.el || 'root') + ' . ' + k, total);
    }
    return;
  }
  const s = JSON.stringify(v);
  if (typeof v === 'string') {
    if (/^\$L?[0-9a-f]+$/.test(v)) add(cat, 'row refs ($L/$id)', len(s));
    else add(cat, 'string values', len(s));
  } else if (typeof v === 'number') add(cat, 'number values', len(s));
  else add(cat, 'null/bool values', len(s));
}
function snapshot(cat) {
  let t = 0;
  for (const e of cat.values()) t += e.bytes;
  return t;
}

function parseRows(buf) {
  const text = buf.toString('utf8');
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const colon = text.indexOf(':', i);
    const id = text.slice(i, colon);
    let j = colon + 1;
    let tag = '';
    if (/[A-Z]/.test(text[j]) && text[j] !== '[') tag = text[j];
    let end;
    if (tag === 'T') {
      const comma = text.indexOf(',', j);
      const n = parseInt(text.slice(j + 1, comma), 16);
      // length is in bytes
      let bytes = 0;
      end = comma + 1;
      while (bytes < n) bytes += len(text[end++]);
    } else {
      end = text.indexOf('\n', j);
    }
    const raw = text.slice(i, end + (tag === 'T' ? 0 : 1));
    rows.push({
      id,
      tag,
      body: text.slice(j, end),
      bytes: len(raw) + (tag === 'T' ? 0 : 0),
    });
    i = end + (tag === 'T' ? 0 : 1);
  }
  return rows;
}

(async () => {
  const file = arg('file', null);
  const buf = file ? fs.readFileSync(file) : await render(+arg('rows', 1000));
  if (arg('dump', null)) fs.writeFileSync(arg('dump'), buf);
  const rows = parseRows(buf);
  const kinds = new Map();
  const cat = new Map();
  const fields = new Map();
  const rowHeader = new Map();
  let modelRows = 0;
  for (const r of rows) {
    const hdr = len(r.id + ':');
    add(rowHeader, 'row id + colon + newline', hdr + 1, 1);
    if (r.tag === 'I') add(kinds, 'I (module refs)', r.bytes);
    else if (r.tag) add(kinds, r.tag + ' rows', r.bytes);
    else {
      modelRows++;
      add(kinds, 'model rows', r.bytes);
      let v;
      try {
        v = JSON.parse(r.body);
      } catch (e) {
        add(kinds, 'unparsable', r.bytes);
        continue;
      }
      walk(v, cat, fields, {});
    }
  }
  const total = buf.length;
  const pct = n => ((n / total) * 100).toFixed(1) + '%';
  const show = (title, m, top) => {
    console.log('\n## ' + title);
    [...m.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, top)
      .forEach(([k, e]) =>
        console.log(
          String(e.bytes).padStart(10),
          pct(e.bytes).padStart(6),
          String(e.count).padStart(8) + 'x',
          k
        )
      );
  };
  console.log(
    'total bytes',
    total,
    'rows',
    rows.length,
    'model rows',
    modelRows
  );
  show('Row kinds', kinds, 20);
  show('Row id overhead', rowHeader, 5);
  show('Model bytes by category (excl. row id)', cat, 20);
  show(
    'Per prop name incl. value (top, nested counted in parents too)',
    fields,
    25
  );
  // Dedupe potential: repeated strings and repeated object shapes
  const strs = new Map();
  const shapes = new Map();
  (function collect() {
    for (const r of rows) {
      if (r.tag) continue;
      let v;
      try {
        v = JSON.parse(r.body);
      } catch (e) {
        continue;
      }
      (function w(x) {
        if (typeof x === 'string') add(strs, x, len(JSON.stringify(x)));
        else if (Array.isArray(x)) x.forEach(w);
        else if (x && typeof x === 'object') {
          add(
            shapes,
            Object.keys(x).join(','),
            len(
              Object.keys(x)
                .map(k => JSON.stringify(k) + ':')
                .join(',')
            )
          );
          Object.values(x).forEach(w);
        }
      })(v);
    }
  })();
  let dupBytes = 0;
  for (const e of strs.values())
    if (e.count > 1) dupBytes += e.bytes - e.bytes / e.count;
  console.log('\n## Dedupe potential');
  console.log(
    'repeated string values: bytes beyond first occurrence =',
    Math.round(dupBytes)
  );
  let shapeBytes = 0;
  for (const e of shapes.values())
    if (e.count > 1) shapeBytes += e.bytes - e.bytes / e.count;
  console.log(
    'repeated object key-lists: key bytes beyond first occurrence =',
    Math.round(shapeBytes)
  );
  show('Top repeated strings (total bytes)', strs, 8);
})();
