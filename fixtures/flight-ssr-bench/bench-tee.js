'use strict';

// Interleaved in-process timing (median ms/render) of baseline, tee only and
// HTML-first over the tee (tee + `htmlFirst` thenable).
// Usage: NODE_ENV=production node bench-tee.js [--rows=1000] [--n=60]

require('@babel/register')({
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
  only: [/\/src\//],
});
const webpack = require('webpack');
const {clientManifest, ssrManifest} = require('./webpack-mock');
const {renderFlightFizzNode, nodeStreamToString} = require('./render-helpers');

function arg(name, def) {
  const a = process.argv.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : def;
}
const ROWS = +arg('rows', 1000);
const N = +arg('n', 60);

const modes = {
  baseline: {},
  'tee only': {tee: true},
  'html-first + tee': {stub: true, tee: true},
};

webpack(require('./webpack.config'), async err => {
  if (err) throw err;
  const b = require('./build/rsc-bundle.js');
  const apps = {
    'server rows': b.TableServerStatic,
    'client rows': b.PageAppBaseline,
  };
  const variants = {};
  for (const app of Object.keys(apps)) {
    for (const mode of Object.keys(modes)) {
      variants[app + ' | ' + mode] = () =>
        nodeStreamToString(
          renderFlightFizzNode(
            b.renderRSCNode,
            apps[app],
            ROWS,
            clientManifest,
            ssrManifest,
            modes[mode]
          )
        );
    }
  }
  const names = Object.keys(variants);
  const times = Object.fromEntries(names.map(n => [n, []]));
  const html = {};
  for (let i = 0; i < 8; i++) for (const n of names) await variants[n]();
  for (let i = 0; i < N; i++) {
    for (const n of names) {
      const t = process.hrtime.bigint();
      html[n] = await variants[n]();
      times[n].push(Number(process.hrtime.bigint() - t) / 1e6);
    }
  }
  for (const n of names) {
    const s = times[n].sort((a, c) => a - c);
    const inlined = (
      html[n].match(/__FLIGHT_DATA\|\|=\[\]\)\.push\((.*?)\)<\/script>/g) || []
    ).reduce((sum, m) => sum + m.length, 0);
    console.log(
      n.padEnd(36),
      'median ' + s[s.length >> 1].toFixed(2) + ' ms',
      ' p10 ' + s[Math.floor(s.length * 0.1)].toFixed(2),
      ' html ' + html[n].length,
      ' inlined flight ' + inlined
    );
  }
});
