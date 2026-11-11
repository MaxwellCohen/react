'use strict';

const path = require('path');
const url = require('url');
const fs = require('fs');

const clientModules = {};
const clientManifest = {};
const ssrModuleMap = {};
const clientFiles = {};
let moduleIdx = 0;

function registerClientModule(modulePath) {
  const chunkId = 'chunk-' + moduleIdx++;
  const absPath = path.resolve(__dirname, modulePath);
  // Same id webpack's `named` moduleIds gives the module in the browser build.
  const id = './' + path.relative(__dirname, absPath).split(path.sep).join('/');
  const actualExports = require(absPath);
  clientModules[id] = actualExports;
  clientFiles[id] = absPath;

  const href = url.pathToFileURL(absPath).href;
  clientManifest[href] = {id, chunks: [chunkId, absPath], name: '*'};
  // Frameworks' SSR manifests list no chunks (modules are already loaded on the
  // server), so client references resolve synchronously and Fizz never suspends
  // on them. FLIGHT_BENCH_ASYNC_CHUNKS=1 restores the old async chunk load.
  ssrModuleMap[id] = {
    '*': {
      id,
      chunks: process.env.FLIGHT_BENCH_ASYNC_CHUNKS ? [chunkId, absPath] : [],
      name: '*',
    },
  };
}

// Auto-register all 'use client' components by scanning src/
const srcDirs = [
  path.resolve(__dirname, 'src'),
  path.resolve(__dirname, 'src/components'),
  path.resolve(__dirname, 'src/scenarios'),
];
for (const dir of srcDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const filePath = path.join(dir, file);
    const source = fs.readFileSync(filePath, 'utf-8');
    if (
      source.trimStart().startsWith("'use client'") ||
      source.trimStart().startsWith('"use client"')
    ) {
      registerClientModule(filePath);
    }
  }
}

global.__webpack_require__ = function (id) {
  if (clientModules[id]) {
    return clientModules[id];
  }
  throw new Error('Unknown module: ' + id);
};
global.__webpack_chunk_load__ = function () {
  return new Promise(function (resolve) {
    setImmediate(resolve);
  });
};

const ssrManifest = {
  moduleMap: ssrModuleMap,
  moduleLoading: null,
  serverModuleMap: null,
};

module.exports = {clientManifest, ssrManifest, clientFiles};
