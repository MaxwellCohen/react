/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Run the whole file with enableFlightHostElision turned on. Dedupe is on too
// to cover that nothing from elided rows reaches the main stream.
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
        <section>
          <p>{'static text '.repeat(5)}</p>
          <Mismatch />
        </section>
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
    // React regenerates the root on the client, where the stub has nothing to
    // adopt.
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
  // Returns {main, rows}: rendered with or without elision.
  async function flight(element, elide = true) {
    const rows = new Map();
    const options = elide
      ? {onElidedRow: (id, json) => rows.set(id, json)}
      : {};
    const main = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(
          element,
          webpackMap,
          options,
        ),
      ),
    );
    return {main, rows};
  }

  function rowsText(rows) {
    return Array.from(rows.values()).join('\n');
  }

  // Hydrates `html` with the (row-less) browser payload `main`.
  async function hydrate(main, html, extraOptions) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const errors = [];
    const response = consume(main);
    await response;
    let root;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(
        container,
        <Shell response={response} />,
        {
          onUncaughtError: e => errors.push('uncaught: ' + e.message),
          onCaughtError: e => errors.push('caught: ' + e.message),
          onRecoverableError: e => errors.push('recoverable: ' + e.message),
          ...extraOptions,
        },
      );
    });
    return {container, errors, root};
  }

  it('does not elide host elements passed as props to a client component', async () => {
    const Tabs = clientExports(function Tabs({panels}) {
      const [i, setI] = React.useState(0);
      return (
        <section>
          <button onClick={() => setI(1)}>next</button>
          {panels[i]}
        </section>
      );
    });
    const App = () => (
      <Tabs panels={[<div key="a">panel-A</div>, <div key="b">panel-B</div>]} />
    );
    const f = await flight(<App />);
    expect(f.rows.size).toBe(0);
    expect(f.main).not.toContain('$J');
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('panel-A');
    await act(() => container.querySelector('button').click());
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('panel-B');
  });

  it('keeps keyed host elements in client props so a reorder is reflected', async () => {
    const Sortable = clientExports(function Sortable({items}) {
      const [rev, setRev] = React.useState(false);
      return (
        <div>
          <button onClick={() => setRev(true)}>rev</button>
          <ul>{rev ? items.slice().reverse() : items}</ul>
        </div>
      );
    });
    const App = () => (
      <Sortable
        items={[<li key="x">x</li>, <li key="y">y</li>, <li key="z">z</li>]}
      />
    );
    const f = await flight(<App />);
    const html = await ssr(f);
    const {container} = await hydrate(f.main, html);
    expect(container.querySelector('ul').textContent).toBe('xyz');
    await act(() => container.querySelector('button').click());
    expect(container.querySelector('ul').textContent).toBe('zyx');
  });

  it('keeps keyed static children of a client list so a reorder is reflected', async () => {
    const List = clientExports(function List({children}) {
      const [rev, setRev] = React.useState(false);
      const items = React.Children.toArray(children);
      return (
        <div>
          <button onClick={() => setRev(true)}>rev</button>
          <ul>{rev ? items.slice().reverse() : items}</ul>
        </div>
      );
    });
    const App = () => (
      <List>
        <li key="x">x</li>
        <li key="y">y</li>
        <li key="z">z</li>
      </List>
    );
    const f = await flight(<App />);
    expect(f.rows.size).toBe(0);
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    await act(() => container.querySelector('button').click());
    expect(errors).toEqual([]);
    expect(container.querySelector('ul').textContent).toBe('zyx');
  });

  it('does not elide server children of a client panel that hides then shows them', async () => {
    const Panel = clientExports(function Panel({children}) {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setOpen(!open)}>toggle</button>
          {open ? <aside>{children}</aside> : null}
        </div>
      );
    });
    const App = () => (
      <Panel>
        <p>modal-body</p>
      </Panel>
    );
    const f = await flight(<App />);
    expect(f.rows.size).toBe(0);
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    expect(container.textContent).not.toContain('modal-body');
    await act(() => container.querySelector('button').click());
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('modal-body');
  });

  it('keeps the key on the stub of an elided element', async () => {
    const Client = clientExports(function Client() {
      return <i>c</i>;
    });
    function Item({label}) {
      return <li>{label}</li>;
    }
    const App = () => (
      <ul>
        <Client />
        {['a', 'b'].map(l => (
          <li key={l}>item-{l}</li>
        ))}
        <Item key="srv" label="from-server-component" />
      </ul>
    );
    const f = await flight(<App />);
    expect(f.main).toMatch(/\$J[0-9a-f]+:li:a"/);
    expect(f.main).toMatch(/\$J[0-9a-f]+:li:b"/);
    expect(f.main).toMatch(/\$J[0-9a-f]+:li:srv"/);
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    expect(errors).toEqual([]);
    expect(container.querySelectorAll('li').length).toBe(3);
  });

  it('does not elide a Suspense fallback that is shown after hydration', async () => {
    const p = new Promise(() => {});
    const Loader = clientExports(function Loader() {
      const [go, setGo] = React.useState(false);
      if (go) {
        use(p);
      }
      return <button onClick={() => setGo(true)}>load</button>;
    });
    const App = () => (
      <main>
        <React.Suspense fallback={<p className="skeleton">loading...</p>}>
          <Loader />
        </React.Suspense>
      </main>
    );
    const f = await flight(<App />);
    expect(f.rows.size).toBe(0);
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    await act(() => container.querySelector('button').click());
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('loading...');
  });

  it('does not elide children of a client-only wrapper', async () => {
    const ClientOnly = clientExports(function ClientOnly({children}) {
      const [mounted, setMounted] = React.useState(false);
      React.useEffect(() => setMounted(true), []);
      return mounted ? children : null;
    });
    const App = () => (
      <div>
        <ClientOnly>
          <p>client-only-content</p>
        </ClientOnly>
      </div>
    );
    const f = await flight(<App />);
    expect(f.rows.size).toBe(0);
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('client-only-content');
  });

  it('recovers a boundary that client-renders next to static content', async () => {
    let onServer = true;
    const ServerFragile = clientExports(function ServerFragile() {
      if (onServer) {
        throw new Error('window is not defined');
      }
      return <b>client-ok</b>;
    });
    const App = () => (
      <main>
        <React.Suspense fallback="loading">
          <section>
            <p>static-sibling</p>
            <ServerFragile />
          </section>
        </React.Suspense>
      </main>
    );
    const f = await flight(<App />);
    const response = consume(f.main, f.rows);
    await response;
    let html;
    await act(async () => {
      html = await readAll(
        await ReactDOMFizzServer.renderToReadableStream(
          <Shell response={response} />,
          {onError() {}},
        ),
      );
    });
    onServer = false;
    const {container} = await hydrate(f.main, html, {
      onRecoverableError() {},
    });
    // TODO(html-first): the static <p> inside a Suspense boundary is not
    // elided, so the boundary can client-render. If elision is ever allowed
    // there, ElidedHost needs a way to fetch the row (the page goes blank).
    expect(container.textContent).toContain('static-sibling');
    expect(container.textContent).toContain('client-ok');
  });

  it('fails the SSR consumer when an elided row is missing', async () => {
    const App = () => <article>{'important '.repeat(10)}</article>;
    const f = await flight(<App />);
    expect(f.rows.size).toBe(1);
    const response = consume(f.main, new Map());
    let error;
    try {
      await response;
      await act(async () => {
        await readAll(
          await ReactDOMFizzServer.renderToReadableStream(
            <Shell response={response} />,
            {onError() {}},
          ),
        );
      });
    } catch (e) {
      error = e;
    }
    expect(error && error.message).toContain('Missing elided row');
  });

  it('elides only static host elements in host position', async () => {
    const Client = clientExports(function Client({children, fallback}) {
      return (
        <div>
          {children}
          {fallback}
        </div>
      );
    });
    function ServerTable() {
      return (
        <table>
          <tbody>
            <tr>
              <td>server-row-text</td>
            </tr>
          </tbody>
        </table>
      );
    }
    const App = () => (
      <main>
        <Client fallback={<i>client-prop-text</i>}>
          <p>client-child-text</p>
          <ServerTable />
        </Client>
        <section>
          <Client />
          <h2>host-child-text</h2>
        </section>
        <React.Suspense fallback={<p>suspense-fallback-text</p>}>
          <ServerTable />
          <h3>suspense-content-text</h3>
        </React.Suspense>
        <ServerTable />
      </main>
    );
    const f = await flight(<App />);
    const elided = rowsText(f.rows);
    // Elided: server component output and static host children of a host
    // element that stays in the payload.
    expect(elided).toContain('server-row-text');
    expect(elided).toContain('host-child-text');
    expect(f.main).not.toContain('host-child-text');
    // Kept: anything inside the props or children of a non-host element.
    [
      'client-prop-text',
      'client-child-text',
      'suspense-fallback-text',
      'suspense-content-text',
    ].forEach(kept => {
      expect(elided).not.toContain(kept);
      expect(f.main).toContain(kept);
    });
    // The server component output next to them still is.
    expect(f.main).toMatch(/\$J[0-9a-f]+:table/);
    // Hydrates without mismatches.
    const html = await ssr(f);
    const {errors} = await hydrate(f.main, html);
    expect(errors).toEqual([]);
  });

  it('evaluates each element once, so deep trees scale linearly', async () => {
    const Leaf = clientExports(function Leaf() {
      return <i>leaf</i>;
    });
    async function countTypeReads(depth) {
      let reads = 0;
      const counted = element =>
        new Proxy(element, {
          get(target, key) {
            if (key === 'type') {
              reads++;
            }
            return Reflect.get(target, key);
          },
        });
      let node = <Leaf />;
      for (let d = 0; d < depth; d++) {
        const spans = [];
        for (let i = 0; i < 20; i++) {
          spans.push(counted(<span key={i}>static</span>));
        }
        node = (
          <div>
            {spans}
            {node}
          </div>
        );
      }
      await flight(node);
      return reads;
    }
    const shallow = await countTypeReads(20);
    const deep = await countTypeReads(80);
    // 4x deeper: ~4x the reads (linear), not ~16x (quadratic).
    expect(deep / shallow).toBeLessThan(6);
  });

  it('keeps everything from elided rows out of the main stream', async () => {
    const T = 'this is a long static paragraph that repeats across rows';
    const BIG_TEXT = 'big-text-'.repeat(300);
    const App = () => (
      <main>
        <p>{T}</p>
        <p>{T}</p>
        <p>{T}</p>
        <p>{BIG_TEXT}</p>
      </main>
    );
    const f = await flight(<App />);
    expect(f.rows.size).toBeGreaterThan(0);
    expect(f.main).not.toContain(T);
    expect(f.main).not.toContain('big-text-');
  });
});
