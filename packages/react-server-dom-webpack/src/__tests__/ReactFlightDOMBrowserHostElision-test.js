/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Run the whole file with enableFlightHtmlFirst turned on.
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightHtmlFirst: true,
}));

// Polyfills for test environment
global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.WritableStream =
  require('web-streams-polyfill/ponyfill/es6').WritableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

const {
  insertNodesAndExecuteScripts,
} = require('react-dom/src/test-utils/FizzTestUtils');
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
let reportedErrors;

describe('ReactFlightDOMBrowser host elision', () => {
  beforeEach(() => {
    jest.resetModules();
    // Errors reported to window.onerror (reportError).
    reportedErrors = [];
    global.reportError = error => reportedErrors.push(error.message);

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

  afterEach(() => {
    expect(reportedErrors).toEqual([]);
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
  function consume(rsc, elidedRows, extraOptions) {
    return ReactServerDOMClient.createFromReadableStream(stringToStream(rsc), {
      elidedRows,
      ...extraOptions,
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
      : {onElidedRow: false};
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

  // Zero framework opt-in: flag on, no onElidedRow / elidedRows. The server
  // registers rows internally; the first createFrom* claims them for SSR.
  // `flightOpts` is undefined (auto registry) or {onElidedRow: false} (SPA nav).
  async function renderSharedApp(count, ...rest) {
    const flightOpts = rest.length ? rest[0] : {onElidedRow: true};
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
                <td>{'name-' + i}</td>
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
          flightOpts,
        ),
      ),
    );
    return main;
  }

  it('SSRs and hydrates with no onElidedRow or elidedRows (internal registry)', async () => {
    const ROWS = 50;
    const main = await renderSharedApp(ROWS);
    expect(main).toContain(':Q');
    expect(main).toContain('$J');
    expect(main).not.toContain('name-49');

    // First consumer claims the registry (SSR).
    const html = await ssr({main, rows: undefined});
    expect(html).toContain('name-49');
    expect(html).toContain('clicks');

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const table = container.querySelector('table');
    const button = container.querySelector('button');

    // Second consumer finds an empty registry → stubs → adopt HTML.
    const response = consume(main, undefined);
    await response;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <Shell response={response} />);
    });
    expect(container.querySelector('table')).toBe(table);
    expect(container.querySelector('button')).toBe(button);
    expect(container.querySelectorAll('tr').length).toBe(ROWS);
    await act(() => {
      button.click();
    });
    expect(button.textContent).toBe('clicks:1');
  });

  it('does not elide unless the request opts in', async () => {
    const main = await renderSharedApp(10, undefined);
    expect(main).not.toContain('$J');
    expect(main).not.toContain(':Q');
    expect(main).toContain('name-9');
    const off = await renderSharedApp(10, {onElidedRow: false});
    expect(off).not.toContain('$J');
    expect(off).not.toContain(':Q');
    expect(off).toContain('name-9');
  });

  it('isolates concurrent zero-opt-in requests', async () => {
    const a = await renderSharedApp(3);
    const b = await renderSharedApp(7);
    expect(a).toMatch(/:Q[0-9a-f]+\n/);
    expect(b).toMatch(/:Q[0-9a-f]+\n/);
    const idA = a.match(/:Q([0-9a-f]+)\n/)[1];
    const idB = b.match(/:Q([0-9a-f]+)\n/)[1];
    expect(idA).not.toBe(idB);

    const htmlA = await ssr({main: a, rows: undefined});
    const htmlB = await ssr({main: b, rows: undefined});
    expect(htmlA).toContain('name-2');
    expect(htmlA).not.toContain('name-6');
    expect(htmlB).toContain('name-6');
    expect(htmlB.match(/name-\d+/g).length).toBe(7);
  });

  it('SPA navigation uses onElidedRow: false for a full payload', async () => {
    const ROWS = 20;
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
                <td>{'name-' + i}</td>
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
    async function renderOnce(opts) {
      return serverAct(async () =>
        readAll(
          ReactServerDOMServer.renderToReadableStream(
            <App size={ROWS} />,
            webpackMap,
            opts,
          ),
        ),
      );
    }

    const main = await renderOnce({onElidedRow: true});
    const html = await ssr({main, rows: undefined});
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const table = container.querySelector('table');
    const button = container.querySelector('button');
    const response = consume(main, undefined);
    await response;
    let root;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(
        container,
        <Shell response={response} />,
      );
    });
    expect(container.querySelectorAll('tr').length).toBe(ROWS);

    // Same module identity, full Flight (what /rsc navigation must emit).
    const nextMain = await renderOnce({onElidedRow: false});
    expect(nextMain).not.toContain('$J');
    expect(nextMain).not.toContain(':Q');
    const nextResponse = consume(nextMain);
    await nextResponse;
    await act(() => {
      root.render(<Shell response={nextResponse} />);
    });
    expect(container.querySelectorAll('tr').length).toBe(ROWS);
    // Elided regions are re-created from the payload; client components stay.
    expect(container.querySelector('table')).not.toBe(table);
    expect(container.querySelector('button')).toBe(button);
  });

  it('navigation to different content replaces the elided regions', async () => {
    const Counter = clientExports(function Counter() {
      const [n, setN] = React.useState(0);
      return <button onClick={() => setN(n + 1)}>c:{n}</button>;
    });
    const Page = ({v}) => (
      <main>
        <h1 className={v}>{'Title ' + v}</h1>
        <Counter />
        <section>
          <ul>
            <li>1</li>
            {v === 'b' ? <li>2</li> : null}
          </ul>
          <a href={'/' + v} className={v}>
            link
          </a>
        </section>
      </main>
    );
    const first = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(
          <Page v="a" />,
          webpackMap,
          {
            onElidedRow: true,
          },
        ),
      ),
    );
    const html = await ssr({main: first, rows: undefined});
    const {container, root, errors} = await hydrate(first, html);
    const full = await flight(<Page v="b" />, false);
    const response = consume(full.main);
    await response;
    await act(() => root.render(<Shell response={response} />));
    expect(errors).toEqual([]);
    expect(container.querySelector('h1').className).toBe('b');
    expect(container.querySelector('h1').textContent).toBe('Title b');
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelector('a').getAttribute('href')).toBe('/b');
  });

  it('elides static output under the entries of a root element map', async () => {
    function Page() {
      return (
        <table>
          <tbody>
            {Array.from({length: 100}, (_, i) => (
              <tr key={i}>
                <td>{'name-' + i}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    const model = {page: <Page />, later: Promise.resolve(<Page />)};
    const render = (opts = {onElidedRow: true}) =>
      serverAct(async () =>
        readAll(
          ReactServerDOMServer.renderToReadableStream(model, webpackMap, opts),
        ),
      );
    const full = await render({onElidedRow: false});
    const main = await render();
    expect(main.length).toBeLessThan(full.length / 10);
    expect(main).not.toContain('name-99');
    function MapShell({response}) {
      return use(response).page;
    }
    const sResponse = consume(main, undefined);
    await sResponse;
    let html;
    await act(async () => {
      html = await readAll(
        await ReactDOMFizzServer.renderToReadableStream(
          <MapShell response={sResponse} />,
        ),
      );
    });
    expect(html).toContain('name-99');
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const table = container.querySelector('table');
    const bResponse = consume(main, undefined);
    await bResponse;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <MapShell response={bResponse} />);
    });
    expect(container.querySelector('table')).toBe(table);
    expect(container.querySelectorAll('tr').length).toBe(100);
  });

  // Returns {main, rows}: rendered with or without elision.
  async function flight(element, elide = true) {
    const rows = new Map();
    const options = elide
      ? {onElidedRow: (id, json) => rows.set(id, json)}
      : {onElidedRow: false};
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
  // `flightOptions` go to createFromReadableStream (e.g. onElidedContentMissing).
  // `rootOptions` go to hydrateRoot.
  async function hydrate(main, html, flightOptions, rootOptions) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const errors = [];
    const response = consume(main, undefined, flightOptions);
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
          ...rootOptions,
        },
      );
    });
    return {container, errors, root};
  }

  // Framework recovery: replace the tree with a full, non-elided payload.
  async function renderFullPayload(root, app) {
    const full = await flight(app, false);
    expect(full.main).not.toContain('$J');
    const response = consume(full.main);
    await response;
    await act(() => root.render(<Shell response={response} />));
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

  it('elides keyed static children of a client list; reorder moves adopted DOM', async () => {
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
    expect(f.rows.size).toBeGreaterThan(0);
    expect(f.main).toMatch(/\$J[0-9a-f]+:li:x"/);
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    expect(container.querySelector('ul').textContent).toBe('xyz');
    await act(() => container.querySelector('button').click());
    expect(errors).toEqual([]);
    expect(container.querySelector('ul').textContent).toBe('zyx');
  });

  it('elides client-panel children and recovers when they mount without server DOM', async () => {
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
    expect(f.rows.size).toBeGreaterThan(0);
    expect(f.main).not.toContain('modal-body');
    const html = await ssr(f);
    const missing = jest.fn();
    const {container, errors, root} = await hydrate(f.main, html, {
      onElidedContentMissing: () => {
        missing();
      },
    });
    expect(container.textContent).not.toContain('modal-body');
    await act(() => container.querySelector('button').click());
    expect(missing).toHaveBeenCalled();
    await renderFullPayload(root, <App />);
    expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
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

  it('elides client-only-wrapper children and recovers after mount', async () => {
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
    expect(f.rows.size).toBeGreaterThan(0);
    expect(f.main).not.toContain('client-only-content');
    const html = await ssr(f);
    const missing = jest.fn();
    const {container, errors, root} = await hydrate(f.main, html, {
      onElidedContentMissing: () => {
        missing();
      },
    });
    // useEffect opens the children; stubs recover.
    expect(missing).toHaveBeenCalled();
    await renderFullPayload(root, <App />);
    expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
    expect(container.textContent).toContain('client-only-content');
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

  it('elides host-position static hosts including client children, not other props', async () => {
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
    // Elided: server output, host children, Suspense children, and client children.
    expect(elided).toContain('server-row-text');
    expect(elided).toContain('host-child-text');
    expect(elided).toContain('suspense-content-text');
    expect(elided).toContain('client-child-text');
    expect(f.main).not.toContain('host-child-text');
    expect(f.main).not.toContain('suspense-content-text');
    expect(f.main).not.toContain('client-child-text');
    // Kept: non-children client props, and Suspense fallbacks.
    ['client-prop-text', 'suspense-fallback-text'].forEach(kept => {
      expect(elided).not.toContain(kept);
      expect(f.main).toContain(kept);
    });
    expect(f.main).toMatch(/\$J[0-9a-f]+:table/);
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

  describe('inside Suspense boundaries', () => {
    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Streams the HTML of `app` like a server does. The SSR consumer gets the
    // Flight rows of the elided content that contains each marker in `later`
    // one at a time, in that order, so Fizz completes those boundaries in that
    // order. Returns the browser payload and the HTML chunks (the shell, then
    // one chunk per released row).
    async function streamHTML(app, later = [], fizzOptions) {
      const f = await flight(app);
      const lines = f.main.split('\n').filter(line => line !== '');
      const held = later.map(marker => {
        let id = -1;
        f.rows.forEach((json, key) => {
          if (json.includes(marker)) {
            id = key;
          }
        });
        const line = lines.find(l => l.includes('"$J' + id.toString(16) + ':'));
        expect(line).toBeDefined();
        return line;
      });
      let controller;
      const ssrStream = new ReadableStream({
        type: 'bytes',
        start(c) {
          controller = c;
        },
      });
      const send = text => controller.enqueue(encoder.encode(text));
      send(
        lines
          .filter(line => !held.includes(line))
          .map(line => line + '\n')
          .join(''),
      );
      const response = ReactServerDOMClient.createFromReadableStream(
        ssrStream,
        {elidedRows: f.rows},
      );
      let buffer = '';
      await act(async () => {
        const html = await ReactDOMFizzServer.renderToReadableStream(
          <Shell response={response} />,
          fizzOptions,
        );
        const reader = html.getReader();
        (async () => {
          while (true) {
            const {done, value} = await reader.read();
            if (done) {
              return;
            }
            buffer += decoder.decode(value);
          }
        })();
      });
      const chunks = [buffer];
      for (let i = 0; i < held.length; i++) {
        const line = held[i];
        buffer = '';
        await act(async () => {
          send(line + '\n');
        });
        chunks.push(buffer);
      }
      controller.close();
      return {main: f.main, chunks};
    }

    // Inserts HTML chunks into `container` and runs Fizz's inline scripts.
    async function insertHTML(container, html) {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      await act(async () => {
        await insertNodesAndExecuteScripts(temp, container, null);
        // Fizz reveals completed boundaries on the next frame.
        jest.runAllTimers();
      });
    }

    // The visible text: no scripts, no hidden (not yet revealed) segments.
    function visibleText(container) {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('script, [hidden]').forEach(n => n.remove());
      return clone.textContent;
    }

    // Hydrates with the browser payload once the first `ready` chunks are in.
    async function hydrateStream(main, chunks, ready, onElidedContentMissing) {
      const container = document.createElement('div');
      document.body.appendChild(container);
      for (let i = 0; i < ready; i++) {
        await insertHTML(container, chunks[i]);
      }
      const errors = [];
      const response = ReactServerDOMClient.createFromReadableStream(
        stringToStream(main),
        {onElidedContentMissing},
      );
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
          },
        );
      });
      return {container, errors, root};
    }

    function makeStreamingApp() {
      const Counter = clientExports(function Counter() {
        const [n, setN] = React.useState(0);
        return <button onClick={() => setN(n + 1)}>n:{n}</button>;
      });
      // Resolve in the Flight server out of order: side, outer, inner.
      async function Late({ms, label, children}) {
        await delay(ms);
        return (
          <section id={label}>
            <p>{label + '-text'}</p>
            {children}
          </section>
        );
      }
      return function App() {
        return (
          <main>
            <h1>shell-text</h1>
            <Counter />
            <React.Suspense fallback={<i>loading-outer</i>}>
              <Late ms={10} label="outer">
                <React.Suspense fallback={<i>loading-inner</i>}>
                  <Late ms={20} label="inner" />
                </React.Suspense>
              </Late>
            </React.Suspense>
            <React.Suspense fallback={<i>loading-side</i>}>
              <Late ms={5} label="side" />
            </React.Suspense>
          </main>
        );
      };
    }

    function getContentNodes(container) {
      return ['h1', '#outer > p', '#inner', '#side'].map(selector =>
        container.querySelector(selector),
      );
    }

    it('elides and adopts late server components in nested boundaries completed out of order', async () => {
      const App = makeStreamingApp();
      // Fizz completes the outer, then the side, then the inner boundary.
      const {main, chunks} = await streamHTML(<App />, [
        'outer-text',
        'side-text',
        'inner-text',
      ]);
      ['shell-text', 'outer-text', 'inner-text', 'side-text'].forEach(text =>
        expect(main).not.toContain(text),
      );
      expect(chunks[0]).toContain('loading-outer');
      expect(chunks[0]).not.toContain('side-text');
      expect(chunks[2]).toContain('side-text');
      expect(chunks[3]).toContain('inner-text');

      const missing = jest.fn();
      const container = document.createElement('div');
      for (let i = 0; i < chunks.length; i++) {
        await insertHTML(container, chunks[i]);
      }
      const before = getContentNodes(container);
      before.forEach(node => expect(node).not.toBe(null));
      const {container: hydrated, errors} = await hydrateStream(
        main,
        chunks,
        chunks.length,
        missing,
      );
      const after = getContentNodes(hydrated);
      after.forEach(node => expect(node).not.toBe(null));
      expect(visibleText(hydrated)).toBe(
        'shell-textn:0outer-textinner-textside-text',
      );
      expect(errors).toEqual([]);
      expect(missing).not.toHaveBeenCalled();
      const nodes = getContentNodes(hydrated);
      await act(() => hydrated.querySelector('button').click());
      expect(hydrated.querySelector('button').textContent).toBe('n:1');
      // The server nodes were adopted, not recreated.
      expect(getContentNodes(hydrated)).toEqual(nodes);
    });

    it('adopts boundaries that are still pending when hydration starts', async () => {
      const App = makeStreamingApp();
      const {main, chunks} = await streamHTML(<App />, [
        'side-text',
        'outer-text',
        'inner-text',
      ]);
      const missing = jest.fn();
      const {container, errors} = await hydrateStream(main, chunks, 1, missing);
      expect(visibleText(container)).toContain('loading-outer');
      await act(() => container.querySelector('button').click());
      for (let i = 1; i < chunks.length; i++) {
        await insertHTML(container, chunks[i]);
      }
      const nodes = getContentNodes(container);
      nodes.forEach(node => expect(node).not.toBe(null));
      await act(() => container.querySelector('button').click());
      expect(visibleText(container)).toBe(
        'shell-textn:2outer-textinner-textside-text',
      );
      expect(getContentNodes(container)).toEqual(nodes);
      expect(errors).toEqual([]);
      expect(missing).not.toHaveBeenCalled();
    });

    function makeFragileApp(throwOnServer, withSuspense = true) {
      let onServer = true;
      const Fragile = clientExports(function Fragile() {
        if (onServer && throwOnServer) {
          throw new Error('window is not defined');
        }
        return <b>{onServer ? 'server-only' : 'client-ok'}</b>;
      });
      async function Article() {
        await delay(5);
        return <article>{'static-sibling '.repeat(3)}</article>;
      }
      const content = (
        <>
          <Article />
          <p>static-p</p>
          <Fragile />
        </>
      );
      function App() {
        return (
          <main>
            <h1>shell-text</h1>
            {withSuspense ? (
              <React.Suspense fallback={<i>loading</i>}>
                {content}
              </React.Suspense>
            ) : (
              content
            )}
          </main>
        );
      }
      return {
        App,
        goToClient() {
          onServer = false;
        },
      };
    }

    async function expectRecovery(throwOnServer, withSuspense) {
      const {App, goToClient} = makeFragileApp(throwOnServer, withSuspense);
      const {main, chunks} = await streamHTML(<App />, [], {onError() {}});
      expect(main).not.toContain('static-sibling');
      expect(main).not.toContain('static-p');
      goToClient();
      const missing = jest.fn();
      const {container, errors, root} = await hydrateStream(
        main,
        chunks,
        chunks.length,
        missing,
      );
      expect(missing).toHaveBeenCalledTimes(1);
      // Nothing was committed while the content is missing.
      expect(container.textContent).toContain('shell-text');
      expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
      const h1 = container.querySelector('h1');
      await renderFullPayload(root, <App />);
      expect(visibleText(container)).toBe(
        'shell-text' + 'static-sibling '.repeat(3) + 'static-pclient-ok',
      );
      // The full payload has real elements where the stubs were, so they are
      // remounted, as on a navigation.
      expect(container.querySelector('h1')).not.toBe(h1);
      expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
      expect(missing).toHaveBeenCalledTimes(1);
      return {chunks, errors};
    }

    it('recovers a boundary that client-renders after a server error', async () => {
      const {chunks, errors} = await expectRecovery(true, true);
      expect(chunks.join('')).toContain('loading');
      expect(errors.length).toBe(1);
    });

    it('recovers a boundary that client-renders after a hydration mismatch', async () => {
      const {errors} = await expectRecovery(false, true);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('recoverable');
    });

    it('recovers a root that client-renders after a hydration mismatch', async () => {
      const {errors} = await expectRecovery(false, false);
      // The mismatch, and the full payload rendered before the root committed.
      expect(errors.length).toBe(2);
      errors.forEach(e => expect(e).toContain('recoverable'));
    });

    it('reports an error and keeps the page when onElidedContentMissing is not provided', async () => {
      for (let i = 0; i < 2; i++) {
        const withSuspense = i === 0;
        const {App, goToClient} = makeFragileApp(withSuspense, withSuspense);
        const {main, chunks} = await streamHTML(<App />, [], {onError() {}});
        goToClient();
        const {container, errors} = await hydrateStream(
          main,
          chunks,
          chunks.length,
          undefined,
        );
        expect(reportedErrors.length).toBe(1);
        expect(reportedErrors.pop()).toContain('onElidedContentMissing');
        expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
        // Not blank: the shell and the boundary fallback (or the server HTML
        // of the root) stay on screen.
        expect(visibleText(container)).toContain('shell-text');
        expect(visibleText(container)).toContain(
          withSuspense ? 'loading' : 'static-p',
        );
      }
    });
  });
});
