'use strict';

// e2e server: SSR HTML (+ inlined Flight) for baseline and html-first pages,
// full Flight at /rsc/* (what a client-side navigation fetches), client bundle.
require('@babel/register')({
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
  only: [/\/src\//],
});
const http = require('http');
const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const {clientManifest, ssrManifest} = require('../webpack-mock');
const {renderFlightFizzNode, nodeStreamToString} = require('../render-helpers');

function build(config) {
  return new Promise((resolve, reject) =>
    webpack(config, (err, stats) =>
      err || stats.hasErrors()
        ? reject(err || new Error(stats.toString({errors: true})))
        : resolve()
    )
  );
}

async function start(port) {
  await build(require('../webpack.config'));
  await build(require('./webpack.client.config'));
  const b = require('../build/rsc-bundle.js');
  const pages = {
    // Client-component rows, nothing elided (flag-off behavior).
    baseline: b.PageAppBaseline,
    // Client-component rows, CSS/JSON-LD elided, live hand-off.
    'client-rows': b.PageAppBaseline,
    // Server-component rows, nothing elided.
    'server-rows-baseline': b.PageAppHtmlFirst,
    // Server-component rows, elided (JSON rows / live rows).
    'html-first': b.PageAppHtmlFirst,
    'html-first-json': b.PageAppHtmlFirst,
  };
  const clientJs = fs.readFileSync(path.join(__dirname, 'build/client.js'));
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const rows = +(url.searchParams.get('rows') || 1000);
    const [, kind, name] = url.pathname.split('/');
    try {
      if (url.pathname === '/client.js') {
        res.writeHead(200, {'Content-Type': 'text/javascript'});
        return res.end(clientJs);
      }
      if (kind === 'rsc' && pages[name]) {
        // (html-first-json shares the page; only the SSR hand-off differs.)
        // Navigation response: full Flight. onElidedRow: false is required when
        // the flag is on — otherwise React auto-elides and the browser has no
        // HTML to adopt for those stubs.
        res.writeHead(200, {'Content-Type': 'text/x-component'});
        return b
          .renderRSCNode(clientManifest, pages[name], rows, {
            onElidedRow: false,
          })
          .pipe(res);
      }
      if (pages[kind]) {
        const html = await nodeStreamToString(
          renderFlightFizzNode(
            b.renderRSCNode,
            pages[kind],
            rows,
            clientManifest,
            ssrManifest,
            {
              elide: kind !== 'baseline' && kind !== 'server-rows-baseline',
              // html-first / client-rows: zero opt-in (internal registry).
              // html-first-json: explicit JSON side channel (legacy API demo).
              sideChannel: kind === 'html-first-json',
            }
          )
        );
        res.writeHead(200, {'Content-Type': 'text/html'});
        return res.end(
          html.replace(
            '</body></html>',
            '<script src="/client.js" defer></script></body></html>'
          )
        );
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise(r => server.listen(port, r));
  return server;
}

module.exports = {start};
if (require.main === module) {
  start(+process.env.PORT || 3003).then(() => console.log('listening'));
}
