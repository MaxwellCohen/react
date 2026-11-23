'use strict';

// One process per React build variant. Redirects react/react-dom/
// react-server-dom-webpack/scheduler to the variant, bundles the selected
// scenarios (RSC + browser), and renders them in-process like bench-inproc.js.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const {PassThrough} = require('stream');

const VARIANT = process.env.SCN_VARIANT;
const DIR = process.env.SCN_DIR;
const FIXTURE = path.resolve(__dirname, '..');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (
    /^(react|react-dom|react-server-dom-webpack|scheduler)(\/|$)/.test(request)
  ) {
    return origResolve.call(this, request, parent, isMain, {paths: [DIR]});
  }
  return origResolve.call(this, request, parent, isMain, options);
};

let problems = [];
for (const k of ['error', 'warn']) {
  console[k] = (...a) =>
    problems.push(k + ': ' + a.map(String).join(' ').slice(0, 500));
}
process.on('warning', w => problems.push('node warning: ' + w.message));

require('@babel/register')({
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
  only: [/\/src\//],
});
const webpack = require('webpack');
const {clientManifest, ssrManifest, clientFiles} = require('../webpack-mock');
const {renderFlightFizzNode, nodeStreamToString} = require('../render-helpers');

function build(config) {
  return new Promise((resolve, reject) =>
    webpack(config, (err, stats) =>
      err || stats.hasErrors()
        ? reject(err || new Error(stats.toString({errors: true, all: false})))
        : resolve()
    )
  );
}

const babelRule = {
  test: /\.jsx?$/,
  exclude: /node_modules/,
  loader: require.resolve('babel-loader'),
  options: {presets: [['@babel/preset-react', {runtime: 'automatic'}]]},
};
const modules = [path.join(DIR, 'node_modules'), 'node_modules'];

let bundle;
let roots;
async function init({files, clientMode}) {
  // RSC bundle: same config as the fixture's, entry generated for the selected scenarios.
  const entry = path.join(DIR, 'entry-rsc.js');
  fs.writeFileSync(
    entry,
    [
      "const React = require('react');",
      "const {renderToPipeableStream} = require('react-server-dom-webpack/server');",
      'exports.roots = {',
      ...files.map(
        ([id, f]) =>
          `  ${JSON.stringify(id)}: require(${JSON.stringify(f)}).Root,`
      ),
      '};',
      'exports.renderRSCNode = (manifest, Root, size, options) =>',
      '  renderToPipeableStream(React.createElement(Root, {size}), manifest, options);',
    ].join('\n')
  );
  const base = require('../webpack.config');
  await build(
    Object.assign({}, base, {
      entry,
      context: FIXTURE,
      output: Object.assign({}, base.output, {
        path: path.join(DIR, 'build-rsc'),
      }),
      resolve: Object.assign({}, base.resolve, {modules}),
    })
  );
  bundle = require(path.join(DIR, 'build-rsc/rsc-bundle.js'));
  roots = bundle.roots;
  if (clientMode !== 'none') {
    const wanted = new Set(files.map(([id]) => id));
    const reg = Object.entries(clientFiles)
      .filter(
        ([, f]) =>
          path.basename(f).includes('.client.') &&
          wanted.has(path.basename(f).split('.')[0])
      )
      .map(([, f]) => `  require(${JSON.stringify(f)}),`);
    fs.writeFileSync(
      path.join(DIR, 'registry.js'),
      'window.__clientModules = [\n' + reg.join('\n') + '\n];\n'
    );
    await build({
      name: 'client',
      context: FIXTURE,
      target: 'web',
      mode: clientMode,
      optimization: {
        minimize: false,
        moduleIds: 'named',
        concatenateModules: false,
      },
      entry: path.join(__dirname, 'client-entry.js'),
      output: {
        path: path.join(DIR, 'build-client'),
        filename: 'client.js',
        clean: true,
      },
      module: {rules: [babelRule]},
      resolve: {
        extensions: ['.js', '.jsx'],
        modules,
        alias: {'scenario-registry': path.join(DIR, 'registry.js')},
      },
    });
  }
  problems = [];
  return {react: require('react').version};
}

async function render({id, size, recoverErrors}) {
  problems = [];
  const optIn = VARIANT === 'all';
  const t = process.hrtime.bigint();
  let html = await nodeStreamToString(
    renderFlightFizzNode(
      bundle.renderRSCNode,
      roots[id],
      size,
      clientManifest,
      ssrManifest,
      {
        // Tee + htmlFirst thenable (settled by Fizz, see render-helpers).
        stub: optIn,
        tee: VARIANT === 'tee',
        recoverErrors: !!recoverErrors,
      }
    )
  );
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  // The payload id row (`:P<random hex>`) varies in length by a byte between
  // renders; pin it so byte counts are deterministic.
  html = html.replace(/:P[0-9a-f]+\\n/g, ':Pc0ffee0c0ffee0\\n');
  return {html, ms, problems: problems.splice(0)};
}

// Full (non-stubbed) Flight payload: what a client navigation / refetch receives.
// Responses that go straight to the browser never opt in (htmlFirst: false
// states it explicitly), so they carry full content.
function flight({id, size}) {
  problems = [];
  return new Promise((resolve, reject) => {
    const chunks = [];
    const out = new PassThrough();
    out.on('data', c => chunks.push(c));
    out.on('end', () =>
      resolve({
        flight: Buffer.concat(chunks).toString('utf8'),
        problems: problems.splice(0),
      })
    );
    out.on('error', reject);
    bundle
      .renderRSCNode(clientManifest, roots[id], size, {htmlFirst: false})
      .pipe(out);
  });
}

const handlers = {init, render, flight};
process.on('message', async ({id, cmd, args}) => {
  try {
    process.send({id, result: await handlers[cmd](args)});
  } catch (e) {
    process.send({id, error: String((e && e.stack) || e)});
  }
});
