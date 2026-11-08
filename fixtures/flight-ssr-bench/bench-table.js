'use strict';

// RSC "double data" baseline: 1000-row table in three variants.
//   a) server-component table + Flight payload inlined into HTML
//   b) same table as a 'use client' component, no Flight data
//   c) plain Fizz
// Usage: NODE_ENV=production node bench-table.js [--rows=1000] [--json-out=f]

require('@babel/register')({
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
  only: [/\/src\//],
});

const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const webpack = require('webpack');
const {clientManifest, ssrManifest} = require('./webpack-mock');
const {renderFizzNode, renderFlightFizzNode} = require('./render-helpers');

function arg(name, def) {
  const a = process.argv.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : def;
}
const ROWS = +arg('rows', 1000);
const JSON_OUT = arg('json-out', null);
const PORT = 3002;

function build() {
  return new Promise((resolve, reject) =>
    webpack(require('./webpack.config'), (err, stats) =>
      err || stats.hasErrors()
        ? reject(err || new Error(stats.toString({errors: true})))
        : resolve()
    )
  );
}

function get(path) {
  return new Promise((resolve, reject) =>
    http.get({port: PORT, path}, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    })
  );
}

function run(autocannon, url, connections, amount) {
  return new Promise((resolve, reject) => {
    const i = autocannon({url, connections, amount});
    autocannon.track(i, {renderProgressBar: false, renderResultsTable: false});
    i.on('done', resolve);
    i.on('error', reject);
  });
}

async function main() {
  await build();
  const {
    renderRSCNode,
    TableServer,
    TableServerHost,
  } = require('./build/rsc-bundle.js');
  const TableClient = require('./src/TableClient.js').default;
  const TablePlain = require('./src/TablePlain.js').default;

  const routes = {
    'a-server-flight-inlined': res =>
      renderFlightFizzNode(
        renderRSCNode,
        TableServer,
        ROWS,
        clientManifest,
        ssrManifest
      ).pipe(res),
    // Like-for-like with (c): same lean host-only table as a server component.
    'd-server-host-flight-inlined': res =>
      renderFlightFizzNode(
        renderRSCNode,
        TableServerHost,
        ROWS,
        clientManifest,
        ssrManifest
      ).pipe(res),
    'e-server-host-elided': res =>
      renderFlightFizzNode(
        renderRSCNode,
        TableServerHost,
        ROWS,
        clientManifest,
        ssrManifest,
        {elide: true}
      ).pipe(res),
    'b-client-no-flight': res => renderFizzNode(TableClient, ROWS).pipe(res),
    'c-plain-fizz': res => renderFizzNode(TablePlain, ROWS).pipe(res),
  };
  const server = http.createServer((req, res) => {
    const h = routes[req.url.slice(1)];
    if (!h) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, {'Content-Type': 'text/html'});
    h(res);
  });
  await new Promise(r => server.listen(PORT, r));

  const autocannon = require('autocannon');
  const out = [];
  console.log('rows=%d', ROWS);
  for (const name of Object.keys(routes)) {
    const body = await get('/' + name);
    const html = body.toString('utf8');
    const scripts =
      html.match(/<script>\(self\.__FLIGHT_DATA[\s\S]*?<\/script>/g) || [];
    const flightBytes = scripts.reduce((n, s) => n + Buffer.byteLength(s), 0);
    const r = {
      name,
      htmlBytes: body.length,
      htmlGzip: zlib.gzipSync(body).length,
      flightInlineBytes: flightBytes,
      flightInlineGzip: zlib.gzipSync(scripts.join('')).length,
    };
    for (const c of [1, 10]) {
      await run(autocannon, 'http://localhost:' + PORT + '/' + name, c, 100);
      const d = await run(
        autocannon,
        'http://localhost:' + PORT + '/' + name,
        c,
        500
      );
      r['reqPerSec_c' + c] = +((1000 / d.latency.mean) * d.connections).toFixed(
        1
      );
      r['errors_c' + c] = d.errors + d.timeouts;
    }
    out.push(r);
    console.log(JSON.stringify(r));
  }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
  server.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
