/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Run the whole file with enableFlightHostElision turned on.
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightHostElision: true,
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

describe('ReactFlightDOMBrowser host elision', () => {
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

  function byteLength(text) {
    return encoder.encode(text).length;
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

  // Returns {main, rows}: the stream (what is inlined for the browser) and
  // the rows the server withheld from it, keyed by id (only for SSR).
  async function renderApp(count, elide) {
    const rows = new Map();
    const options = elide
      ? {onElidedRow: (id, json) => rows.set(id, json)}
      : {};
    const Counter = clientExports(function Counter({label}) {
      const [n, setN] = React.useState(0);
      return (
        <button onClick={() => setN(n + 1)}>
          {label}:{n}
        </button>
      );
    });

    function Table({size}) {
      return (
        <table className="data">
          <tbody>
            {Array.from({length: size}, (_, i) => (
              <tr key={i}>
                <td>{i === 1 ? 'line1\nline2' : 'name-' + i}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    function App({size}) {
      return (
        <main>
          <h1>Report</h1>
          <Counter label="clicks" />
          <Table size={size} />
        </main>
      );
    }

    const main = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(
          <App size={count} />,
          webpackMap,
          options,
        ),
      ),
    );
    return {main, rows};
  }

  it('shrinks the payload of a static 1000 row server table', async () => {
    const baseline = await renderApp(1000, false);
    const elided = await renderApp(1000, true);
    const rowBytes = Array.from(elided.rows.values()).reduce(
      (n, json) => n + byteLength(json),
      0,
    );
    console.log(
      `1000 rows, Flight bytes: baseline=${byteLength(baseline.main)} ` +
        `elided stream (inlined in HTML)=${byteLength(elided.main)} ` +
        `withheld rows (SSR only)=${rowBytes}`,
    );
    expect(baseline.main).not.toContain('$J');
    expect(elided.rows.size).toBeGreaterThan(0);
    expect(byteLength(elided.main)).toBeLessThan(
      byteLength(baseline.main) / 20,
    );
    expect(elided.main).toContain('"clicks"');
    expect(elided.main).not.toContain('name-999');
    expect(elided.main).not.toContain('line1');
  });

  it('hydrates from a payload with elided static host elements', async () => {
    // Fizz's chunk count per segment trips the jest infinite loop guard (6000
    // iterations) at 1000 rows, so hydration uses fewer rows than the byte test.
    const ROWS = 500;
    // Small page: SSR output must be identical with and without elision.
    expect(await ssr(await renderApp(10, true))).toBe(
      await ssr(await renderApp(10, false)),
    );
    const elided = await renderApp(ROWS, true);
    const elidedForBrowser = elided.main;
    // Client references are still serialized normally.
    expect(elidedForBrowser).toContain('"clicks"');
    expect(elidedForBrowser).not.toContain('name-499');

    // SSR gets the withheld rows through the side channel.
    const html = await ssr(elided);
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    expect(container.querySelectorAll('tr').length).toBe(ROWS);
    const table = container.querySelector('table');
    const button = container.querySelector('button');

    // Hydrate from the stripped payload. Any mismatch warning fails the test
    // (console.error is asserted to be empty by the test setup).
    const response = consume(elidedForBrowser);
    await response;
    let root;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(
        container,
        <Shell response={response} />,
      );
    });
    // The server DOM was adopted, not recreated.
    expect(container.querySelector('table')).toBe(table);
    expect(container.querySelector('button')).toBe(button);
    expect(container.querySelectorAll('tr').length).toBe(ROWS);
    expect(container.innerHTML).toBe(html);

    // Client components inside the page are interactive.
    await act(() => {
      button.click();
    });
    expect(button.textContent).toBe('clicks:1');

    // A later (non elided) payload replaces the adopted region.
    const next = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(
          <main>
            <h1>Report</h1>
            <table className="data">
              <tbody>
                <tr>
                  <td>only</td>
                </tr>
              </tbody>
            </table>
          </main>,
          webpackMap,
        ),
      ),
    );
    const nextResponse = consume(next);
    await nextResponse;
    await act(() => {
      root.render(<Shell response={nextResponse} />);
    });
    expect(container.querySelectorAll('tr').length).toBe(1);
    expect(container.querySelector('table')).not.toBe(table);
    expect(container.textContent).toBe('Reportonly');
  });

  it('fails loudly instead of dropping content when a boundary client-renders', async () => {
    const Mismatch = clientExports(function Mismatch() {
      return <b>server</b>;
    });
    function App() {
      return (
        <React.Suspense fallback={null}>
          <section>
            <p>{'static text '.repeat(5)}</p>
            <Mismatch />
          </section>
        </React.Suspense>
      );
    }
    const rows = new Map();
    const main = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(<App />, webpackMap, {
          onElidedRow: (id, json) => rows.set(id, json),
        }),
      ),
    );
    expect(rows.size).toBe(1);
    // Force a hydration mismatch: the client component's node is missing, so
    // React regenerates the boundary on the client, where the stub has nothing
    // to adopt.
    const html = (await ssr({main, rows})).replace('<b>server</b>', '');
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const response = consume(main);
    await response;
    // React logs the intentional error; keep the test output clean.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const caught = [];
    class Boundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        return this.state.error ? (
          <i>recovered</i>
        ) : (
          <Shell response={response} />
        );
      }
    }
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <Boundary />, {
        onRecoverableError() {},
        onCaughtError(e) {
          caught.push(e.message);
        },
      });
    });
    expect(caught.join()).toContain('left out of this payload');
    // Not silently blank: the app's error boundary took over.
    expect(container.textContent).toBe('recovered');
    spy.mockRestore();
  });
});
