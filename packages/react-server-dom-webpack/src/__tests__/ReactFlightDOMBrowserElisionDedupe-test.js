/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Run the whole file with host elision and payload dedupe turned on.
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightHostElision: true,
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
let ReactDOMFizzServer;
let ReactServerDOMServer;
let ReactServerDOMClient;
let use;

describe('ReactFlightDOMBrowser host elision + payload dedupe', () => {
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
    ReactDOMFizzServer = require('react-dom/server.browser');
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

  // `elidedRows` is only given to the consumer that renders HTML (SSR). The
  // browser consumer doesn't get them and adopts the server DOM instead.
  function consume(rsc, elidedRows) {
    return ReactServerDOMClient.createFromReadableStream(stringToStream(rsc), {
      elidedRows,
    });
  }

  function Shell({response}) {
    return use(response);
  }

  async function ssr({main, rows}) {
    const response = consume(main, rows);
    await response;
    let html;
    await act(async () => {
      html = await readAll(
        await ReactDOMFizzServer.renderToReadableStream(
          <Shell response={response} />,
        ),
      );
    });
    return html;
  }

  const LONG =
    'A fairly long sentence that is repeated as text and as an attribute value';
  const STYLE = {
    color: 'rgb(255, 0, 0)',
    backgroundColor: 'rgb(0, 0, 255)',
    border: '1px solid black',
  };

  // `order` decides whether the elided or the streamed use of the shared values
  // is the first sighting, which is what decides where dedupe writes its rows.
  async function renderApp(elide, order) {
    const rows = new Map();
    const options = elide
      ? {onElidedRow: (id, json) => rows.set(id, json)}
      : {};
    const Counter = clientExports(function Counter({label}) {
      const [n, setN] = React.useState(0);
      return (
        <button onClick={() => setN(n + 1)}>
          {label.slice(0, 6)}:{n}
        </button>
      );
    });
    const elided = (
      <p style={STYLE} title={LONG}>
        {LONG}
        <span title={LONG}>{LONG}</span>
      </p>
    );
    const streamed = (
      <div style={STYLE} title={LONG}>
        <Counter label={LONG} />
      </div>
    );
    function App() {
      return (
        <main>
          {order === 'elided-first' ? elided : streamed}
          {order === 'elided-first' ? streamed : elided}
          <section title={LONG}>
            <Counter label={LONG} />
            {elided}
          </section>
          {streamed}
        </main>
      );
    }
    const main = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(
          <App />,
          webpackMap,
          options,
        ),
      ),
    );
    return {main, rows};
  }

  function parseRows(main) {
    const rows = new Map();
    main.split('\n').forEach(line => {
      const m = /^([0-9a-f]+):(.*)$/.exec(line);
      if (m !== null && !/^[A-Z]/.test(m[2])) {
        rows.set(m[1], JSON.parse(m[2]));
      }
    });
    return rows;
  }

  // Every reference in the stripped stream must resolve inside the stream.
  function findDanglingReferences(main, elidedIds) {
    const rows = parseRows(main);
    const dangling = [];
    function check(ref, where) {
      const m = /^\$[@L]?([0-9a-f]+)((?::[^:]+)*)$/.exec(ref);
      if (m === null || /^\$J/.test(ref)) {
        return;
      }
      const id = m[1];
      if (elidedIds.has(id)) {
        dangling.push(where + ' -> ' + ref + ' (elided row)');
        return;
      }
      if (!rows.has(id)) {
        // Import rows and text rows are not JSON, so only report model ids.
        if (!new RegExp('(^|\\n)' + id + ':[A-Z]').test(main)) {
          dangling.push(where + ' -> ' + ref + ' (missing row)');
        }
        return;
      }
      let value = rows.get(id);
      const path = m[2] === '' ? [] : m[2].slice(1).split(':');
      for (let i = 0; i < path.length; i++) {
        if (value === null || typeof value !== 'object') {
          dangling.push(where + ' -> ' + ref + ' (path leaves the row)');
          return;
        }
        if (Array.isArray(value) && value[0] === '$' && path[i] === 'props') {
          // An element row is [$, type, key, props]; paths name element.props.
          value = value[3];
        } else {
          value = value[path[i]];
        }
      }
      if (value === undefined) {
        dangling.push(where + ' -> ' + ref + ' (path not found)');
      } else if (typeof value === 'string' && /^\$J/.test(value)) {
        dangling.push(
          where + ' -> ' + ref + ' (points at an elided placeholder)',
        );
      }
    }
    function walk(value, where) {
      if (typeof value === 'string') {
        check(value, where);
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, where + ':' + i));
      } else if (value !== null && typeof value === 'object') {
        Object.keys(value).forEach(k => walk(value[k], where + ':' + k));
      }
    }
    rows.forEach((value, id) => walk(value, id));
    return dangling;
  }

  it('the dangling reference check flags what it should', () => {
    const stream =
      '0:["$J3:p","$3","$9","$1:props:x","$1:props:y"]\n1:["$","a",null,{"x":1}]\n';
    expect(findDanglingReferences(stream, new Set(['3'])).length).toBe(3);
  });

  ['elided-first', 'streamed-first'].forEach(order => {
    it(`does not leave dangling references in the stripped stream (${order})`, async () => {
      const elided = await renderApp(true, order);
      expect(elided.rows.size).toBeGreaterThan(0);
      const elidedIds = new Set(
        Array.from(elided.rows.keys()).map(id => id.toString(16)),
      );
      expect(findDanglingReferences(elided.main, elidedIds)).toEqual([]);
      // Dedupe is active on the stream: the string is not repeated everywhere.
      const plain = await renderApp(false, order);
      expect(elided.main.split(LONG).length - 1).toBeLessThan(
        plain.main.split(LONG).length - 1 + 1,
      );
      expect(elided.main.split(LONG).length - 1).toBeLessThanOrEqual(2);
    });

    it(`renders the same HTML and hydrates from the stripped stream (${order})`, async () => {
      const elided = await renderApp(true, order);
      expect(elided.rows.size).toBeGreaterThan(0);
      const html = await ssr(elided);
      expect(html).toBe(await ssr(await renderApp(false, order)));

      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = html;
      const paragraphs = Array.from(container.querySelectorAll('p'));
      const buttons = Array.from(container.querySelectorAll('button'));
      expect(paragraphs.length).toBe(2);
      expect(container.querySelector('p').style.color).toBe('rgb(255, 0, 0)');

      // The browser only gets the stripped stream.
      const response = consume(elided.main);
      await response;
      await act(() => {
        ReactDOMClient.hydrateRoot(container, <Shell response={response} />);
      });
      expect(Array.from(container.querySelectorAll('p'))).toEqual(paragraphs);
      expect(container.innerHTML).toBe(html);
      await act(() => {
        buttons[0].click();
      });
      expect(buttons[0].textContent).toBe('A fair:1');
    });
  });
});
