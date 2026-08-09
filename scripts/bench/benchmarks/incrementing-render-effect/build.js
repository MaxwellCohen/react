'use strict';

const {join} = require('path');

async function build(reactPath, asyncCopyTo) {
  // HTML references the historical .min.js names used by the other benches.
  await asyncCopyTo(
    join(reactPath, 'build', 'dist', 'react.production.js'),
    join(__dirname, 'react.production.min.js')
  );
  await asyncCopyTo(
    join(reactPath, 'build', 'dist', 'react-dom.production.js'),
    join(__dirname, 'react-dom.production.min.js')
  );
}

module.exports = build;
