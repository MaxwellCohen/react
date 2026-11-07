/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Run the whole file with enableFlightPayloadDedupe turned on.
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightPayloadDedupe: true,
}));

// Polyfills for test environment
global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.WritableStream =
  require('web-streams-polyfill/ponyfill/es6').WritableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

const {
  patchMessageChannel,
} = require('../../../../scripts/jest/patchMessageChannel');

let clientExports;
let webpackMap;
let act;
let serverAct;
let React;
let ReactDOMClient;
let ReactServerDOMServer;
let ReactServerDOMClient;
let use;

describe('ReactFlightDOMBrowser payload dedupe', () => {
  beforeEach(() => {
    jest.resetModules();

    const ReactServerScheduler = require('scheduler');
    patchMessageChannel(ReactServerScheduler);
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    require('react');
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.browser'),
    );
    const WebpackMock = require('./utils/WebpackMock');
    clientExports = WebpackMock.clientExports;
    webpackMap = WebpackMock.webpackMap;
    ReactServerDOMServer = require('react-server-dom-webpack/server');

    __unmockReact();
    jest.resetModules();

    patchMessageChannel();

    ({act} = require('internal-test-utils'));
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    jest.mock('react-server-dom-webpack/client', () =>
      require('react-server-dom-webpack/client.browser'),
    );
    ReactServerDOMClient = require('react-server-dom-webpack/client');
    use = React.use;
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function readAll(stream) {
    const reader = stream.getReader();
    let result = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        return result;
      }
      result += typeof value === 'string' ? value : decoder.decode(value);
    }
  }

  function stringToStream(text) {
    return new ReadableStream({
      type: 'bytes',
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    });
  }

  const TEXTS = [
    'Outstanding quality and craftsmanship. Would highly recommend it.',
    '$ starts with a dollar sign and is long enough to be deduplicated.',
    'Short one',
  ];

  async function renderPage(count) {
    const Item = clientExports(function Item({text, columns, note}) {
      return (
        <li data-cols={columns.map(c => c.key).join()}>
          {text}|{note}
        </li>
      );
    });
    // Shared by every item: referenced by path from the second item on.
    const columns = [{key: 'name'}, {key: 'price'}];
    function Page() {
      return (
        <ul>
          {Array.from({length: count}, (_, i) => (
            <Item
              key={i}
              text={TEXTS[i % 3]}
              columns={columns}
              note={'unique note number ' + i + ' that is also fairly long....'}
            />
          ))}
        </ul>
      );
    }
    return serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(<Page />, webpackMap),
      ),
    );
  }

  function countOf(haystack, needle) {
    return haystack.split(needle).length - 1;
  }

  it('writes repeated long strings and shared object paths once', async () => {
    const payload = await renderPage(300);
    // Each repeated long string: once inline, once in its own row.
    expect(countOf(payload, TEXTS[0])).toBe(2);
    expect(countOf(payload, TEXTS[1].slice(1))).toBe(2);
    // A long reference path to the shared array is not repeated per item.
    expect(payload).not.toMatch(/"\$[0-9a-f]+:[a-z0-9:]{24,}"/);
    // Strings below the threshold are left alone.
    expect(countOf(payload, TEXTS[2])).toBe(100);
    // Unique long strings are not deduped.
    expect(countOf(payload, 'unique note number 7 ')).toBe(1);

    const response = ReactServerDOMClient.createFromReadableStream(
      stringToStream(payload),
    );
    await response;
    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    function Shell() {
      return use(response);
    }
    await act(() => {
      root.render(<Shell />);
    });
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(300);
    for (let i = 0; i < 300; i++) {
      expect(items[i].getAttribute('data-cols')).toBe('name,price');
      expect(items[i].textContent).toBe(
        TEXTS[i % 3] +
          '|unique note number ' +
          i +
          ' that is also fairly long....',
      );
    }
  });
});
