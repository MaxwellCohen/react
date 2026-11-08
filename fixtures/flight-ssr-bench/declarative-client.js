'use strict';

// Browser entry for declarative-server.js. Bundled by esbuild at server start.
const React = require('react');
const {hydrateRoot} = require('react-dom/client');
const createPages = require('./declarative-pages.js');

const params = new URLSearchParams(location.search);
const {App} = createPages(React, {
  boundaries: Number(params.get('n') || 300),
  cssMs: Number(params.get('cssMs') || 900),
  order: params.get('order') || 'forwards',
});
window.__recoverable = [];
window.__hydrateStartedAt = Math.round(performance.now());
hydrateRoot(
  document,
  React.createElement(App, {page: params.get('page') || 'basic'}),
  {
    onRecoverableError(error) {
      window.__recoverable.push(String((error && error.message) || error));
      console.error('recoverable: ' + ((error && error.message) || error));
    },
  }
);
