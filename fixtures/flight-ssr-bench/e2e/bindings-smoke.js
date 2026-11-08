'use strict';

// Smoke test for every server binding x entry (webpack, turbopack, parcel,
// unbundled, esm; node, browser, edge): elided rows as JSON and as live values,
// unstable_pruneForBrowser, and the inline fallback when no row callback is
// given. Needs a build with the flags on (see the fixture README) that also
// contains react and react-dom in build/node_modules.
//   node e2e/bindings-smoke.js            (runs every combination)
//   node --conditions react-server e2e/bindings-smoke.js <pkg> <entry>   (one)
// One combination per process: React supports one RSC renderer per process.
if (process.argv.length < 4) {
  const {spawnSync} = require('child_process');
  const fs = require('fs');
  const pathMod = require('path');
  const stub = pathMod.join(
    require('os').tmpdir(),
    'bindings-smoke-webpack-stub.js'
  );
  fs.writeFileSync(
    stub,
    'global.__webpack_require__=function(){};global.__webpack_chunk_load__=function(){};'
  );
  const root = pathMod.resolve(__dirname, '../../../build/node_modules/');
  let failed = false;
  for (const pkg of ['webpack', 'turbopack', 'parcel', 'unbundled', 'esm']) {
    for (const entry of ['node', 'browser', 'edge']) {
      if (!fs.existsSync(`${root}/react-server-dom-${pkg}/server.${entry}.js`))
        continue;
      const r = spawnSync(
        process.execPath,
        ['--conditions', 'react-server', '-r', stub, __filename, pkg, entry],
        {encoding: 'utf8'}
      );
      process.stdout.write(r.stdout + r.stderr);
      if (r.status !== 0) failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}
// Smoke-tests every server binding x entry: elided rows (JSON + live), prune, inline fallback.
const path = require('path');
const B = path.resolve(__dirname, '../../../build/node_modules') + '/';
const React = require(B + 'react');
const {PassThrough} = require('stream');
async function readAll(s) {
  const chunks = [];
  if (s.getReader) {
    const r = s.getReader();
    for (;;) {
      const {done, value} = await r.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
  } else {
    await new Promise((res, rej) => {
      s.on('data', c => chunks.push(Buffer.from(c)));
      s.on('end', res);
      s.on('error', rej);
    });
  }
  return Buffer.concat(chunks).toString();
}
const BIG = 'v'.repeat(1500);
const results = [];
let failed = false;
(async () => {
  for (const pkg of [process.argv[2]]) {
    for (const entry of [process.argv[3]]) {
      const file = B + 'react-server-dom-' + pkg + '/server.' + entry + '.js';
      if (!require('fs').existsSync(file)) continue;
      let mod;
      try {
        mod = require(file);
      } catch (e) {
        results.push([
          pkg,
          entry,
          'LOAD FAIL ' +
            e.message.slice(0, 300).replace(/.*node_modules\//, ''),
        ]);
        failed = true;
        continue;
      }
      if (typeof mod.unstable_pruneForBrowser !== 'function') {
        results.push([pkg, entry, 'NO prune export']);
        failed = true;
        continue;
      }
      const prune = mod.unstable_pruneForBrowser;
      const model = () =>
        React.createElement(
          'section',
          null,
          React.createElement('p', {id: 'a'}, 'static text'),
          React.createElement('div', {'data-x': prune({k: BIG})})
        );
      const render = async opts => {
        const args =
          pkg === 'parcel'
            ? [model(), opts]
            : [model(), pkg === 'esm' ? 'file:///' : {}, opts];
        if (
          (mod.renderToReadableStream && entry !== 'node') ||
          !mod.renderToPipeableStream
        ) {
          return readAll(mod.renderToReadableStream(...args));
        }
        const out = new PassThrough();
        const done = readAll(out);
        mod.renderToPipeableStream(...args).pipe(out);
        return done;
      };
      try {
        const rowsJ = new Map(),
          rowsL = new Map();
        const mJ = await render({onElidedRow: (id, j) => rowsJ.set(id, j)});
        const mL = await render({onElidedValue: (id, v) => rowsL.set(id, v)});
        const mN = await render({});
        const ok = [
          [
            'json rows',
            rowsJ.size === 2 &&
              mJ.includes('$J') &&
              !mJ.includes(BIG) &&
              [...rowsJ.values()].join().includes(BIG),
          ],
          [
            'live rows',
            rowsL.size === 2 &&
              mL.includes('$J') &&
              !mL.includes(BIG) &&
              [...rowsL.values()].every(v => typeof v === 'object'),
          ],
          ['inline fallback', !mN.includes('$J') && mN.includes(BIG)],
        ];
        const bad = ok.filter(x => !x[1]).map(x => x[0]);
        results.push([pkg, entry, bad.length ? 'FAIL ' + bad.join(',') : 'ok']);
        if (bad.length) failed = true;
      } catch (e) {
        results.push([pkg, entry, 'ERROR ' + String(e.stack).slice(0, 200)]);
        failed = true;
      }
    }
  }
  results.forEach(r => console.log(r.join('\t')));
  process.exit(failed ? 1 : 0);
})();
