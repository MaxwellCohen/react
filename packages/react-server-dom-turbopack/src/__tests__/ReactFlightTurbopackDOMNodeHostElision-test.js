/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightStaticHostElision: true,
}));

let ReactServer;
let ReactServerDOMServer;
let serverAct;
let turbopackMap;

describe('ReactFlightTurbopackDOMNode static host elision', () => {
  beforeEach(() => {
    jest.resetModules();
    serverAct = require('internal-test-utils').serverAct;
    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-turbopack/server', () =>
      require('react-server-dom-turbopack/server.node'),
    );
    ReactServer = require('react');
    ReactServerDOMServer = require('react-server-dom-turbopack/server');
    turbopackMap = require('./utils/TurbopackMock').turbopackMap;
  });

  function App() {
    return ReactServer.createElement(
      'section',
      null,
      ReactServer.createElement('h1', null, 'static-heading'),
    );
  }

  async function readWebStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        return text;
      }
      text += decoder.decode(value, {stream: true});
    }
  }

  it('forwards elideStaticHosts from renderToReadableStream', async () => {
    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        ReactServer.createElement(App),
        turbopackMap,
        {elideStaticHosts: {onValue() {}}},
      ),
    );
    const text = await readWebStream(stream);
    expect(text).toContain('$J');
    expect(text).not.toContain('static-heading');
  });

  it('forwards elideStaticHosts from renderToPipeableStream', async () => {
    const {PassThrough} = require('stream');
    const out = new PassThrough();
    let text = '';
    out.on('data', chunk => {
      text += chunk.toString();
    });
    const finished = new Promise(resolve => out.on('end', resolve));
    await serverAct(() =>
      ReactServerDOMServer.renderToPipeableStream(
        ReactServer.createElement(App),
        turbopackMap,
        {elideStaticHosts: {onValue() {}}},
      ).pipe(out),
    );
    await finished;
    expect(text).toContain('$J');
    expect(text).not.toContain('static-heading');
  });
});
