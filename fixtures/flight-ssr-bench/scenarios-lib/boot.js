'use strict';

// Shared start-up for check/metrics: registry (needs @babel/register for ESM
// scenarios) + one initialized worker per variant.
require('@babel/register')({
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/plugin-transform-modules-commonjs'],
  only: [/\/src\//],
});
const {select} = require('../src/scenarios');
const {prepareVariant, startWorker} = require('./common');

async function boot(opts, {client}) {
  const scenarios = select(opts.only);
  if (!scenarios.length) throw new Error('No scenarios found in src/scenarios');
  for (const s of scenarios) s.size = s.sizes[opts.size];
  const files = scenarios.map(s => [s.id, s.file]);
  const workers = [];
  const dirs = {};
  await Promise.all(
    opts.variants.map(async v => {
      dirs[v] = prepareVariant(opts.builds, v);
      const w = startWorker(v, dirs[v]);
      workers.push(w);
      w.info = await w.call('init', {files, clientMode: client ? 'production' : 'none'});
    })
  );
  const byName = Object.fromEntries(workers.map(w => [w.name, w]));
  return {scenarios, workers: opts.variants.map(v => byName[v]), dirs, kill: () => workers.forEach(w => w.kill())};
}

module.exports = {boot};
