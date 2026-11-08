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
  const flight = (C, elide, live) => () =>
    nodeStreamToString(
      renderFlightFizzNode(
        b.renderRSCNode,
        C,
        ROWS,
        clientManifest,
        ssrManifest,
        {elide, live}
      )
    );
  const PageFizz = require('./src/PageApp.js').makePage(false);
  const variants = {
    'PageApp fizz (no RSC) floor': () =>
      nodeStreamToString(renderFizzNode(PageFizz, ROWS)),
    'PageApp baseline flight': flight(b.PageAppBaseline, false),
    'PageApp html-first': flight(b.PageAppHtmlFirst, true),
    'PageApp html-first LIVE': flight(b.PageAppHtmlFirst, true, true),
    'fizz same markup (no RSC)': () =>
      nodeStreamToString(renderFizzNode(FizzSame, ROWS)),
    'lean rows': flight(b.TableServerLean, false),
    'lean rows, elide': flight(b.TableServerLean, true),
    'static rows (prune tr), elide': flight(b.TableServerStatic, true),
    'static tbody (prune tbody), elide': flight(b.TableServerStaticBody, true),
    'static rows LIVE': flight(b.TableServerStatic, true, true),
    'static tbody LIVE': flight(b.TableServerStaticBody, true, true),
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
