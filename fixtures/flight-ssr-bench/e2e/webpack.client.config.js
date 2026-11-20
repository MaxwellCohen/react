'use strict';

const fs = require('fs');
const path = require('path');
const {clientFiles} = require('../webpack-mock');

// registry.js maps module ids (same ids the server's manifest uses) to the
// client component modules, so the browser can resolve client references.
// require() (not import) keeps each client module a registered webpack module.
const registry =
  'window.__clientModules = [\n' +
  Object.values(clientFiles)
    .map(f => `  require(${JSON.stringify(f)}),`)
    .join('\n') +
  '\n];\n';
fs.writeFileSync(path.join(__dirname, 'registry.js'), registry);

module.exports = {
  name: 'client',
  context: path.join(__dirname, '..'),
  target: 'web',
  mode: 'production',
  optimization: {
    minimize: false,
    moduleIds: 'named',
    concatenateModules: false,
  },
  entry: path.join(__dirname, 'entry-client.js'),
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'client.js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: require.resolve('babel-loader'),
        options: {presets: [['@babel/preset-react', {runtime: 'automatic'}]]},
      },
    ],
  },
  resolve: {extensions: ['.js', '.jsx']},
};
