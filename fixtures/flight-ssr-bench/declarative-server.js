'use strict';

// Test server for Fizz declarative patching (unstable_declarativePatching).
//
//   REACT_ROOT=<dir containing node_modules/{react,react-dom}> \
//   REACT_ENV=dev|prod PORT=3010 node declarative-server.js
//
// GET /?page=basic|nested|css|style|heavy|list&mode=decl|script&clientDelay=ms&cssMs=ms&n=boundaries
//   polyfill=1 loads /polyfill.js (env POLYFILL_JS) in <head> (template-for-polyfill)
//   mode=decl   -> unstable_declarativePatching: true (<?start>/<template for>);
//                  batchMs=ms sets the server batch window (default 300, 0 = group only)
//   mode=script -> default $RC script path
// GET /client.js?delay=ms -> hydration bundle (optionally delayed)
// GET /slow.css?ms=ms     -> stylesheet that arrives after `ms`
const fs = require('fs');
const http = require('http');
const path = require('path');
const {createRequire} = require('module');

const ENV = process.env.REACT_ENV || 'prod';
const ROOT = process.env.REACT_ROOT || __dirname;
const PORT = Number(process.env.PORT || 3010);
const rootRequire = createRequire(path.join(ROOT, 'noop.js'));
const React = rootRequire('react');
const {renderToPipeableStream} = rootRequire('react-dom/server');
const createPages = require('./declarative-pages.js');
const esbuild = require(process.env.ESBUILD || 'esbuild');

let clientBundle;
async function buildClient() {
  const nm = path.join(ROOT, 'node_modules');
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'declarative-client.js')],
    bundle: true,
    write: false,
    minify: ENV === 'prod',
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        ENV === 'prod' ? 'production' : 'development'
      ),
    },
    alias: {
      react: path.join(nm, 'react'),
      'react-dom': path.join(nm, 'react-dom'),
      scheduler: path.join(nm, 'scheduler'),
    },
  });
  clientBundle = result.outputFiles[0].text;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/client.js') {
    await sleep(Number(url.searchParams.get('delay') || 0));
    res.writeHead(200, {
      'content-type': 'text/javascript',
      'cache-control': 'no-store',
    });
    res.end(clientBundle);
    return;
  }
  if (url.pathname === '/polyfill.js') {
    // POLYFILL_JS=<path to template-for-polyfill/dist/template-for-polyfill.js>
    res.writeHead(200, {
      'content-type': 'text/javascript',
      'cache-control': 'no-store',
    });
    res.end(fs.readFileSync(process.env.POLYFILL_JS));
    return;
  }
  if (url.pathname === '/slow.css') {
    await sleep(Number(url.searchParams.get('ms') || 0));
    res.writeHead(200, {
      'content-type': 'text/css',
      'cache-control': 'no-store',
    });
    res.end(
      '.styled{display:block;background-color:rgb(0,128,0);padding:40px;color:#fff}'
    );
    return;
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname !== '/') {
    res.writeHead(404);
    res.end();
    return;
  }
  const q = url.searchParams;
  const page = q.get('page') || 'basic';
  const mode = q.get('mode') || 'decl';
  const ctx = {
    cache: new Map(),
    cssMs: Number(q.get('cssMs') || 900),
    boundaries: Number(q.get('n') || 300),
    order: q.get('order') || 'forwards',
    polyfill: q.get('polyfill') === '1',
  };
  const {App} = createPages(React, ctx);
  const {pipe} = renderToPipeableStream(React.createElement(App, {page}), {
    bootstrapScripts: ['/client.js?delay=' + (q.get('clientDelay') || 0)],
    unstable_declarativePatching: mode === 'decl',
    unstable_declarativeBatchMs: q.has('batchMs')
      ? Number(q.get('batchMs'))
      : undefined,
    onShellReady() {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      pipe(res);
    },
    onShellError(error) {
      res.writeHead(500);
      res.end(String(error));
    },
    onError(error) {
      console.error('server error:', error);
    },
  });
});

buildClient().then(() => {
  server.listen(PORT, () =>
    console.log('listening ' + PORT + ' env=' + ENV + ' root=' + ROOT)
  );
});
