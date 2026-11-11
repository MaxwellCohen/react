/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

import {patchSetImmediate} from '../../../../scripts/jest/patchSetImmediate';

// Regression coverage for zero-optin registry SSR flushing Flight :HL hints
// into Fizz (needs Node ALS + createFrom* during Fizz render).
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightStaticHostElision: true,
}));

// Polyfills for test environment
global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

let serverAct;
let use;
let webpackMap;
let FlightReactDOM;
let React;
let ReactServerDOMServer;
let ReactServerDOMClient;
let ReactDOMFizzServer;
let Stream;

describe('ReactFlightDOM html-first :HL hints', () => {
  beforeEach(() => {
    jest.resetModules();
    document.head.innerHTML = '';

    patchSetImmediate();
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    require('react');
    FlightReactDOM = require('react-dom');

    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-unbundled/server.node'),
    );
    const WebpackMock = require('./utils/WebpackMock');
    webpackMap = WebpackMock.webpackMap;
    ReactServerDOMServer = require('react-server-dom-webpack/server');

    jest.unmock('react-server-dom-webpack/server');
    __unmockReact();
    jest.resetModules();

    Stream = require('stream');
    React = require('react');
    use = React.use;
    ReactDOMFizzServer = require('react-dom/server.node');
    jest.mock('react-server-dom-webpack/client', () =>
      require('react-server-dom-webpack/client.browser'),
    );
    ReactServerDOMClient = require('react-server-dom-webpack/client');
  });

  function getTestStream() {
    const writable = new Stream.PassThrough();
    const readable = new ReadableStream({
      start(controller) {
        writable.on('data', chunk => {
          controller.enqueue(chunk);
        });
        writable.on('end', () => {
          controller.close();
        });
      },
    });
    return {readable, writable};
  }

  async function readAll(stream) {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let buffer = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, {stream: true});
    }
    return buffer;
  }

  // Registry SSR used to early-return in ReactDOMFlightServerHostDispatcher
  // when the hint key was already in request.hints, skipping previousDispatcher.L
  // (Fizz). Side-channel PASSed; registry did not flush href-first preloads.
  it('flushes :HL preload hints into Fizz HTML for zero-optin registry SSR', async () => {
    const HREF = '/hint-preload-image.jpg';

    function App() {
      FlightReactDOM.preload(HREF, {as: 'image'});
      return (
        <html>
          <body>
            <p>{'static-host-text-'.repeat(40)}</p>
          </body>
        </html>
      );
    }

    async function renderOnce(flightOpts, createOpts) {
      const {writable: flightWritable, readable: flightReadable} =
        getTestStream();

      await serverAct(() => {
        ReactServerDOMServer.renderToPipeableStream(
          <App />,
          webpackMap,
          flightOpts,
        ).pipe(flightWritable);
      });

      // Pause so Flight and Fizz don't cross-dispatch on the shared test graph.
      await serverAct(() => {});

      let response = null;
      function Root() {
        if (response === null) {
          response = ReactServerDOMClient.createFromReadableStream(
            flightReadable,
            createOpts,
          );
        }
        return use(response);
      }

      const {writable: fizzWritable, readable: fizzReadable} = getTestStream();
      await serverAct(() => {
        ReactDOMFizzServer.renderToPipeableStream(<Root />).pipe(fizzWritable);
      });
      return readAll(fizzReadable);
    }

    const rows = new Map();
    const sideHtml = await renderOnce(
      {elideStaticHosts: {onRow: (id, json) => rows.set(id, json)}},
      {elidedHostRows: rows},
    );
    const registryHtml = await renderOnce(undefined, undefined);

    const hrefFirst = html =>
      (html.match(/rel="preload" href="[^"]*" as="image"/g) || []).length;
    expect(hrefFirst(sideHtml)).toBeGreaterThan(0);
    expect(hrefFirst(registryHtml)).toBe(hrefFirst(sideHtml));
    expect(registryHtml).toContain(HREF);
    expect(sideHtml).toContain(HREF);
  });
});
