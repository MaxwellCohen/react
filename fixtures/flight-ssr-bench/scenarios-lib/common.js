'use strict';

const fs = require('fs');
const path = require('path');
const {fork} = require('child_process');

const FIXTURE = path.resolve(__dirname, '..');
const VARIANTS_DIR = path.join(FIXTURE, '.variants');
const ALL_VARIANTS = ['off', 'elision', 'elision-dedupe', 'all'];
const PKGS = ['react', 'react-dom', 'react-server-dom-webpack', 'scheduler'];

function parseArgs(argv, defaults) {
  const o = Object.assign({only: [], size: 'smoke', builds: process.env.SCENARIO_BUILDS || '', variants: ALL_VARIANTS}, defaults);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--only') o.only = val().split(',').filter(Boolean);
    else if (a === '--size') o.size = val();
    else if (a === '--builds') o.builds = val();
    else if (a === '--variants') o.variants = val().split(',').filter(Boolean);
    else if (a === '--n') o.n = +val();
    else throw new Error('Unknown argument ' + a);
  }
  if (!['smoke', 'full'].includes(o.size)) throw new Error('--size must be smoke|full');
  if (!o.builds) throw new Error('Pass --builds <dir> or set SCENARIO_BUILDS (dir containing off/ elision/ elision-dedupe/ all/, each a build/oss-experimental)');
  o.builds = path.resolve(o.builds);
  for (const v of o.variants) if (!ALL_VARIANTS.includes(v)) throw new Error('Unknown variant ' + v);
  if (!o.variants.includes('off')) o.variants = ['off'].concat(o.variants);
  return o;
}

// Copies the four React packages of one build into .variants/<v>/node_modules
// (read-only use of the build dir) and refuses builds from an older commit.
function prepareVariant(buildsDir, name) {
  const src = path.join(buildsDir, name);
  const server = path.join(src, 'react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js');
  if (!fs.existsSync(server)) throw new Error('Not a React build: ' + src + ' (missing react-server-dom-webpack server bundle)');
  if (fs.readFileSync(server, 'utf8').includes('pruneForBrowser')) {
    throw new Error('Build ' + src + ' still contains unstable_pruneForBrowser: it predates 6ed2e62d21');
  }
  const dir = path.join(VARIANTS_DIR, name);
  const nm = path.join(dir, 'node_modules');
  const stamp = path.join(dir, 'stamp.json');
  const want = JSON.stringify({src, mtime: fs.statSync(server).mtimeMs, size: fs.statSync(server).size});
  let have = '';
  try { have = fs.readFileSync(stamp, 'utf8'); } catch (e) {}
  if (have !== want) {
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(nm, {recursive: true});
    for (const p of PKGS) fs.cpSync(path.join(src, p), path.join(nm, p), {recursive: true});
    // `build-for-flight-prod` omits the react-server jsx runtime that the RSC
    // bundle needs (the fixture normally gets it from its npm install); fill in
    // just those two files, nothing else is taken from node_modules.
    for (const f of ['react-jsx-runtime.react-server.production.js', 'react-jsx-dev-runtime.react-server.production.js']) {
      const to = path.join(nm, 'react/cjs', f);
      const from = path.join(FIXTURE, 'node_modules/react/cjs', f);
      if (!fs.existsSync(to) && fs.existsSync(from)) fs.copyFileSync(from, to);
    }
    fs.writeFileSync(stamp, want);
  }
  return dir;
}

// Persistent worker process per variant (own React copy), request/response over IPC.
function startWorker(name, dir, opts) {
  const child = fork(path.join(__dirname, 'worker.js'), [], {
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production',
      SCN_VARIANT: name,
      SCN_DIR: dir,
    }),
    execArgv: [],
  });
  let seq = 0;
  const pending = new Map();
  child.on('message', m => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
  });
  child.on('exit', code => {
    for (const p of pending.values()) p.reject(new Error('worker ' + name + ' exited (' + code + ')'));
    pending.clear();
  });
  const call = (cmd, args) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, {resolve, reject});
    child.send({id, cmd, args});
  });
  return {name, call, kill: () => child.kill()};
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

module.exports = {FIXTURE, ALL_VARIANTS, parseArgs, prepareVariant, startWorker, quantile};
