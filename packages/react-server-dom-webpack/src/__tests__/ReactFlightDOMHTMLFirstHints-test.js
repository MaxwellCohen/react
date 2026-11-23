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

// Regression coverage for SSR flushing Flight :HL hints into Fizz when Fizz
// reads a tee (needs Node ALS + createFromTee during Fizz render).
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightHTMLFirst: true,
  enableFlightTee: true,
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
let ReactServerDOMNodeClient;
let webpackModuleLoading;
let ReactDOMFizzServer;
let Stream;

describe('ReactFlightDOM html-first :HL hints', () => {
  beforeEach(() => {
    jest.resetModules();

    patchSetImmediate();
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    require('react');
    FlightReactDOM = require('react-dom');

    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.node'),
    );
    const WebpackMock = require('./utils/WebpackMock');
    webpackMap = WebpackMock.webpackMap;
    webpackModuleLoading = WebpackMock.moduleLoading;
    ReactServerDOMServer = require('react-server-dom-webpack/server');

    jest.unmock('react-server-dom-webpack/server');
    __unmockReact();
    jest.resetModules();

    Stream = require('stream');
    React = require('react');
    use = React.use;
    ReactDOMFizzServer = require('react-dom/server.node');
    // Both ways of reading need the SSR client config, so load the Node
    // client first.
    ReactServerDOMNodeClient = jest.requireActual(
      'react-server-dom-webpack/client.node',
    );
    ReactServerDOMClient = ReactServerDOMNodeClient;
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

  // The host dispatcher used to early-return when the hint key was already in
  // request.hints, skipping previousDispatcher.L (Fizz). The tee reader must
  // flush the same href-first preloads that reading the bytes does.
  it('flushes :HL preload hints into Fizz HTML when Fizz reads a tee', async () => {
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

    async function renderBytes() {
      const flightWritable = new Stream.PassThrough();

      await serverAct(() => {
        ReactServerDOMServer.renderToPipeableStream(<App />, webpackMap).pipe(
          flightWritable,
        );
      });

      // Pause so Flight and Fizz don't cross-dispatch on the shared test graph.
      await serverAct(() => {});

      let response = null;
      function Root() {
        if (response === null) {
          response = ReactServerDOMClient.createFromNodeStream(flightWritable, {
            moduleMap: {},
            moduleLoading: webpackModuleLoading,
          });
        }
        return use(response);
      }

      const {writable: fizzWritable, readable: fizzReadable} = getTestStream();
      await serverAct(() => {
        ReactDOMFizzServer.renderToPipeableStream(<Root />).pipe(fizzWritable);
      });
      return readAll(fizzReadable);
    }

    async function renderTee() {
      const tee = ReactServerDOMNodeClient.createTee({
        moduleMap: {},
        moduleLoading: webpackModuleLoading,
      });
      let htmlDone;
      const htmlFirst = new Promise((resolve, reject) => {
        htmlDone = {resolve, reject};
      });
      const {writable: flightWritable, readable: flightReadable} =
        getTestStream();
      const {writable: fizzWritable, readable: fizzReadable} = getTestStream();

      let response = null;
      function Root() {
        if (response === null) {
          response = ReactServerDOMNodeClient.createFromTee(tee);
        }
        return use(response);
      }

      await serverAct(() => {
        ReactServerDOMServer.renderToPipeableStream(<App />, webpackMap, {
          htmlFirst,
          tee,
        }).pipe(flightWritable);
      });
      // Pause so Flight and Fizz don't cross-dispatch on the shared test graph.
      await serverAct(() => {});

      await serverAct(() => {
        const fizz = ReactDOMFizzServer.renderToPipeableStream(<Root />, {
          onAllReady() {
            htmlDone.resolve();
          },
          onError() {
            htmlDone.reject();
          },
        });
        fizz.pipe(fizzWritable);
      });
      const [html, flightBytes] = await Promise.all([
        readAll(fizzReadable),
        readAll(flightReadable),
      ]);
      return {html, flightBytes};
    }

    const teeResult = await renderTee();
    const bytesHtml = await renderBytes();

    const hrefFirst = html =>
      (html.match(/rel="preload" href="[^"]*" as="image"/g) || []).length;
    expect(hrefFirst(teeResult.html)).toBeGreaterThan(0);
    expect(hrefFirst(bytesHtml)).toBe(hrefFirst(teeResult.html));
    expect(bytesHtml).toContain(HREF);
    expect(teeResult.html).toContain(HREF);
    // The tee render stubbed the static text out of the browser's bytes but
    // its HTML has it.
    expect(teeResult.flightBytes).not.toContain('static-host-text-');
    expect(teeResult.html).toContain('static-host-text-');
  });
});
