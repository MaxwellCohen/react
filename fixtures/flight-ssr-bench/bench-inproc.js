'use strict';

// Interleaved in-process timing (median ms/render) of the table variants.
// Less noisy than req/s. Usage: NODE_ENV=production node bench-inproc.js [--rows=1000] [--n=60]

require('@babel/register')({
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
  only: [/\/src\//],
});
const webpack = require('webpack');
const {clientManifest, ssrManifest} = require('./webpack-mock');
const {
  renderFizzNode,
  renderFlightFizzNode,
  nodeStreamToString,
} = require('./render-helpers');

function arg(name, def) {
  const a = process.argv.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : def;
}
const ROWS = +arg('rows', 1000);
const N = +arg('n', 60);

webpack(require('./webpack.config'), async err => {
  if (err) throw err;
  const b = require('./build/rsc-bundle.js');
  const FizzSame = require('./src/FizzSame.js').default;
  const flight = (C, stub) => () =>
    nodeStreamToString(
      renderFlightFizzNode(
        b.renderRSCNode,
        C,
        ROWS,
        clientManifest,
        ssrManifest,
        {stub}
      )
    );
  const PageFizz = require('./src/PageApp.js').makePage(true);
  const variants = {
    'PageApp fizz (no RSC) floor': () =>
      nodeStreamToString(renderFizzNode(PageFizz, ROWS)),
    'PageApp client rows, flight': flight(b.PageAppBaseline, false),
    'PageApp server rows, flight': flight(b.PageAppHtmlFirst, false),
    'PageApp server rows, stub': flight(b.PageAppHtmlFirst, true),
    'fizz same markup (no RSC)': () =>
      nodeStreamToString(renderFizzNode(FizzSame, ROWS)),
    'lean rows': flight(b.TableServerLean, false),
    'lean rows, stub': flight(b.TableServerLean, true),
    'server rows, stub': flight(b.TableServerStatic, true),
    'server tbody, stub': flight(b.TableServerStaticBody, true),
  };
  const names = Object.keys(variants);
  const times = Object.fromEntries(names.map(n => [n, []]));
  const bytes = {};
  for (let i = 0; i < 8; i++) for (const n of names) await variants[n]();
  for (let i = 0; i < N; i++) {
    for (const n of names) {
      const t = process.hrtime.bigint();
      const html = await variants[n]();
      times[n].push(Number(process.hrtime.bigint() - t) / 1e6);
      bytes[n] = html.length;
    }
  }
  for (const n of names) {
    const s = times[n].sort((a, c) => a - c);
    console.log(
      n.padEnd(36),
      'median ' + s[s.length >> 1].toFixed(1) + ' ms',
      ' p10 ' + s[Math.floor(s.length * 0.1)].toFixed(1),
      ' html ' + bytes[n]
    );
  }
});
