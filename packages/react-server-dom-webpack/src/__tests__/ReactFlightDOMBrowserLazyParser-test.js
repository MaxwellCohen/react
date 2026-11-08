/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Run the whole file with enableFlightLazyClientParser turned on.
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightLazyClientParser: true,
  enableFlightLazyTypedArrays: true,
}));

global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

const {
  patchMessageChannel,
} = require('../../../../scripts/jest/patchMessageChannel');

let clientExports;
let serverExports;
let webpackMap;
let webpackServerMap;
let act;
let serverAct;
let React;
let ReactDOMClient;
let ReactServerDOMServer;
let ReactServerDOMClient;
let ReplyEncoder;
let ParserExtension;
let use;

describe('ReactFlightDOMBrowser with enableFlightLazyClientParser', () => {
  beforeEach(() => {
    jest.resetModules();

    const ReactServerScheduler = require('scheduler');
    patchMessageChannel(ReactServerScheduler);
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.browser'),
    );
    const WebpackMock = require('./utils/WebpackMock');
    clientExports = WebpackMock.clientExports;
    serverExports = WebpackMock.serverExports;
    webpackMap = WebpackMock.webpackMap;
    webpackServerMap = WebpackMock.webpackServerMap;
    React = require('react');
    ReactServerDOMServer = require('react-server-dom-webpack/server');

    jest.resetModules();
    __unmockReact();
    ({act} = require('internal-test-utils'));
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    jest.mock('react-server-dom-webpack/client', () =>
      require('react-server-dom-webpack/client.browser'),
    );
    ReactServerDOMClient = require('react-server-dom-webpack/client');
    ReplyEncoder = require('../client/ReactFlightDOMClientBrowserReply');
    ParserExtension = require('../client/ReactFlightDOMClientBrowserParser');
    use = React.use;
  });

  const loadReplyEncoder = () => Promise.resolve(ReplyEncoder);

  it('encodes a reply through the lazily loaded encoder', async () => {
    const load = jest.fn(loadReplyEncoder);
    const body = await ReactServerDOMClient.encodeReply(
      {a: 1, b: ['x', new Date(0)]},
      {unstable_loadReplyEncoder: load},
    );
    expect(load).toHaveBeenCalledTimes(1);
    const decoded = await ReactServerDOMServer.decodeReply(
      body,
      webpackServerMap,
    );
    expect(decoded.a).toBe(1);
    expect(decoded.b[0]).toBe('x');
    expect(decoded.b[1]).toEqual(new Date(0));
  });

  it('throws a clear error if encodeReply has no loader', () => {
    expect(() => ReactServerDOMClient.encodeReply({a: 1})).toThrow(
      'encodeReply() requires the unstable_loadReplyEncoder option',
    );
  });

  it('round trips a server action and a FormData reply through the loader', async () => {
    function greet(text, form) {
      return 'Hello ' + text + ' ' + form.get('name');
    }
    const ServerModule = serverExports({greet});
    let actionProxy;
    function Client({action}) {
      actionProxy = action;
      return 'Click Me';
    }
    const ClientRef = clientExports(Client);

    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        <ClientRef action={ServerModule.greet} />,
        webpackMap,
      ),
    );
    const response = ReactServerDOMClient.createFromReadableStream(stream, {
      async callServer(ref, args) {
        const body = await ReactServerDOMClient.encodeReply(args, {
          unstable_loadReplyEncoder: loadReplyEncoder,
        });
        const decoded = await ReactServerDOMServer.decodeReply(
          body,
          webpackServerMap,
        );
        return greet.apply(null, decoded);
      },
    });
    function App() {
      return use(response);
    }
    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<App />);
    });
    expect(container.innerHTML).toBe('Click Me');

    const form = new FormData();
    form.set('name', 'Sebastian');
    expect(await actionProxy('world', form)).toBe('Hello world Sebastian');
  });

  async function flushMicrotasks() {
    for (let i = 0; i < 100; i++) {
      await null;
    }
  }

  // Renders `model` as the `value` prop of a client component and returns
  // helpers to render it with the given createFromReadableStream options.
  async function setup(model, options) {
    let captured;
    function Client({value}) {
      captured = value;
      return 'done';
    }
    const ClientRef = clientExports(Client);
    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        <ClientRef value={model} />,
        webpackMap,
      ),
    );
    const response = ReactServerDOMClient.createFromReadableStream(
      stream,
      options,
    );
    function App() {
      return use(response);
    }
    const errors = [];
    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container, {
      onUncaughtError(error) {
        errors.push(error);
      },
    });
    const t = {
      container,
      errors,
      start: () =>
        root.render(
          <React.Suspense fallback="loading">
            <App />
          </React.Suspense>,
        ),
      render: () => act(() => t.start()),
      value: () => captured,
    };
    return t;
  }

  it('buffers typed array rows until the parser extension loads, then replays', async () => {
    let resolveLoad;
    const load = jest.fn(
      () =>
        new Promise(resolve => {
          resolveLoad = () => resolve(ParserExtension);
        }),
    );
    const t = await setup(
      {
        i8: new Int8Array([1, -2, 3]),
        f32: new Float32Array([1.5, 2.5]),
        i32: new Int32Array([10, 20, 30]),
        u8: new Uint8Array([4, 5]),
        big: new BigInt64Array([5n]),
        view: new DataView(new Uint8Array([9, 8, 7]).buffer),
        buf: new Uint8Array([6, 7]).buffer,
      },
      {unstable_loadParserExtension: load},
    );
    await act(async () => {
      t.start();
      await flushMicrotasks();
      // The extension hasn't loaded so the typed arrays can't have resolved
      // yet, and the loader is requested exactly once.
      expect(load).toHaveBeenCalledTimes(1);
      expect(t.value()).toBe(undefined);
      resolveLoad();
      await flushMicrotasks();
    });
    expect(t.container.innerHTML).toBe('done');
    expect(load).toHaveBeenCalledTimes(1);
    const value = t.value();
    expect(value.i8).toEqual(new Int8Array([1, -2, 3]));
    expect(value.f32).toEqual(new Float32Array([1.5, 2.5]));
    expect(value.i32).toEqual(new Int32Array([10, 20, 30]));
    expect(value.u8).toEqual(new Uint8Array([4, 5]));
    expect(value.big).toEqual(new BigInt64Array([5n]));
    expect(
      new Uint8Array(
        value.view.buffer,
        value.view.byteOffset,
        value.view.byteLength,
      ),
    ).toEqual(new Uint8Array([9, 8, 7]));
    expect(new Uint8Array(value.buf)).toEqual(new Uint8Array([6, 7]));
  });

  it('keeps stream rows in order with deferred typed arrays and the close row', async () => {
    const source = new ReadableStream({
      start(c) {
        c.enqueue(new Int16Array([1, 2]));
        c.enqueue(new Float64Array([3.5]));
        c.close();
      },
    });
    const t = await setup(source, {
      unstable_loadParserExtension: () =>
        new Promise(resolve => setTimeout(() => resolve(ParserExtension), 10)),
    });
    await t.render();
    const reader = t.value().getReader();
    const chunks = [];
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
    }
    expect(chunks).toEqual([new Int16Array([1, 2]), new Float64Array([3.5])]);
  });

  it('errors clearly on typed array rows without a parser extension loader', async () => {
    const t = await setup({f32: new Float32Array([1])});
    await t.render();
    expect(t.errors.length).toBe(1);
    expect(t.errors[0].message).toContain(
      'require the lazily loaded parser extension',
    );
  });

  it('reports a failing parser extension load as an error', async () => {
    const t = await setup(
      {f32: new Float32Array([1])},
      {
        unstable_loadParserExtension: () =>
          Promise.reject(new Error('chunk failed to load')),
      },
    );
    await t.render();
    expect(t.errors.length).toBe(1);
    expect(t.errors[0].message).toBe('chunk failed to load');
  });
});
