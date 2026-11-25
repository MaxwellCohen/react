/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Run the whole file with enableFlightHTMLFirst turned on.
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightHTMLFirst: true,
  enableFlightTee: true,
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
let ReactDOMFizzStatic;
let ReactServerDOMServer;
let ReactServerDOMClient;
let ReactServerDOMEdgeClient;
let webpackModuleLoading;
let use;
let reportedErrors;

describe('ReactFlightDOMBrowser HTML-first Flight', () => {
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
    webpackModuleLoading = WebpackMock.moduleLoading;
    ReactServerDOMServer = require('react-server-dom-webpack/server');

    __unmockReact();
    jest.resetModules();

    patchMessageChannel();

    ({act} = require('internal-test-utils'));
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactDOMFizzServer = require('react-dom/server.browser');
    ReactDOMFizzStatic = require('react-dom/static.browser');
    jest.mock('react-server-dom-webpack/client', () =>
      require('react-server-dom-webpack/client.browser'),
    );
    ReactServerDOMClient = require('react-server-dom-webpack/client');
    use = React.use;
    ReactServerDOMEdgeClient = jest.requireActual(
      'react-server-dom-webpack/client.edge',
    );
  });

  afterEach(() => {
    expect(reportedErrors).toEqual([]);
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // The server stubs an element only when it has 8 host nodes, or when it takes
  // 512 bytes or more in the payload. A fixture appends this to its text to be
  // stubbed.
  const FILL =
    ' filler text so this element is big enough to be stubbed'.repeat(10);

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

  // The comments the server writes before the DOM of a stub, which a page
  // without them (a minifier removed them) lacks.
  function withoutMarkers(html) {
    return html.replace(/<!--J[0-9a-f]+:[0-9a-f]+-->/g, '');
  }

  function byteLength(text) {
    return encoder.encode(text).length;
  }

  // The browser's consumer: it reads the bytes only, so a stub adopts the
  // server DOM.
  function consume(rsc, extraOptions) {
    return ReactServerDOMClient.createFromReadableStream(
      stringToStream(rsc),
      extraOptions,
    );
  }

  function Shell({response}) {
    return use(response);
  }

  // The HTML of `{main, html}` from `flight`. A full payload (no `html`) is
  // rendered to HTML from its bytes.
  async function ssr({main, html}) {
    if (html !== undefined) {
      return html;
    }
    const response = consume(main);
    await response;
    let result;
    await act(async () => {
      result = await readAll(
        await ReactDOMFizzServer.renderToReadableStream(
          <Shell response={response} />,
        ),
      );
    });
    return result;
  }

  // What a framework does with a tee: the Flight render writes its bytes for
  // the browser and hands every row to the tee, which Fizz reads in this
  // process. Returns the browser's payload and the HTML. `Root` renders the
  // response (default: the whole model is the page).
  // The tee's reader maps each client module id to the module SSR loads.
  function createTeeManifest() {
    const moduleMap = {};
    for (const key in webpackMap) {
      const metadata = webpackMap[key];
      moduleMap[metadata.id] = {'*': metadata};
    }
    return {moduleMap, moduleLoading: webpackModuleLoading};
  }

  async function renderWithTeeInner(model, options, Root = Shell) {
    const tee = ReactServerDOMEdgeClient.createTee(createTeeManifest());
    // Settles when the HTML render is done, as a framework does.
    let htmlDone;
    const htmlFirst = new Promise((resolve, reject) => {
      htmlDone = {resolve, reject};
    });
    const stream = ReactServerDOMServer.renderToReadableStream(
      model,
      webpackMap,
      {htmlFirst, tee, ...options},
    );
    const browser = readAll(stream);
    let response = null;
    function TeeRoot() {
      if (response === null) {
        response = ReactServerDOMEdgeClient.createFromTee(tee);
      }
      return <Root response={response} />;
    }
    const htmlStream = await ReactDOMFizzServer.renderToReadableStream(
      <TeeRoot />,
    );
    // Suspense boundaries complete in place, without inline scripts.
    await htmlStream.allReady;
    htmlDone.resolve();
    const html = await readAll(htmlStream);
    return {main: await browser, html};
  }

  function renderWithTee(model, options, Root) {
    return serverAct(() => renderWithTeeInner(model, options, Root));
  }

  // A render with a tee that the test drives step by step: `settle` settles
  // the htmlFirst thenable, `renderHTML` renders the page from the tee,
  // `text()` is what the browser's stream has so far and `ended()` says
  // whether it is closed. `browser` resolves with all of it. Call it inside
  // serverAct.
  function startTee(model, options, Root = Shell) {
    const tee = ReactServerDOMEdgeClient.createTee(createTeeManifest());
    const settle = {};
    const htmlFirst = new Promise((resolve, reject) => {
      settle.resolve = resolve;
      settle.reject = reject;
    });
    const stream = ReactServerDOMServer.renderToReadableStream(
      model,
      webpackMap,
      {htmlFirst, tee, ...options},
    );
    let text = '';
    let ended = false;
    const reader = stream.getReader();
    const browser = (async () => {
      while (true) {
        const {done, value} = await reader.read();
        if (done) {
          ended = true;
          return text;
        }
        text += decoder.decode(value);
      }
    })();
    let response = null;
    function TeeRoot() {
      if (response === null) {
        response = ReactServerDOMEdgeClient.createFromTee(tee);
      }
      return <Root response={response} />;
    }
    return {
      settle,
      browser,
      element: <TeeRoot />,
      text: () => text,
      ended: () => ended,
      renderHTML: fizzOptions =>
        ReactDOMFizzServer.renderToReadableStream(<TeeRoot />, fizzOptions),
    };
  }

  function macrotasks(count = 3) {
    return new Promise(resolve => {
      let left = count;
      (function next() {
        if (left-- === 0) {
          resolve();
        } else {
          setTimeout(next, 10);
        }
      })();
    });
  }

  // Returns {main, html}: the stream (what is inlined for the browser) and
  // the HTML (only when it is rendered with a tee).
  async function renderApp(count, stub) {
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

    if (stub) {
      return renderWithTee(<App size={count} />);
    }
    const main = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(
          <App size={count} />,
          webpackMap,
          {htmlFirst: false},
        ),
      ),
    );
    return {main, html: undefined};
  }

  it('shrinks the payload of a static 700 row server table', async () => {
    const baseline = await renderApp(700, false);
    const stubbed = await renderApp(700, true);
    console.log(
      `700 rows, Flight bytes: baseline=${byteLength(baseline.main)} ` +
        `stubbed stream (inlined in HTML)=${byteLength(stubbed.main)} ` +
        `HTML=${byteLength(stubbed.html)}`,
    );
    expect(baseline.main).not.toContain('$J');
    expect(stubbed.html).toContain('name-699');
    expect(byteLength(stubbed.main)).toBeLessThan(
      byteLength(baseline.main) / 20,
    );
    expect(stubbed.main).toContain('"clicks"');
    expect(stubbed.main).not.toContain('name-699');
    expect(stubbed.main).not.toContain('line1');
  });

  it('hydrates from a payload with stubbed static host elements', async () => {
    // Fizz's chunk count per segment trips the jest infinite loop guard (6000
    // iterations) at 1000 rows, so these tests use fewer rows.
    const ROWS = 500;
    // Small page: SSR output must be identical with and without stubbing.
    expect(withoutMarkers(await ssr(await renderApp(10, true)))).toBe(
      await ssr(await renderApp(10, false)),
    );
    const stubbed = await renderApp(ROWS, true);
    const stubbedForBrowser = stubbed.main;
    // Client references are still serialized normally.
    expect(stubbedForBrowser).toContain('"clicks"');
    expect(stubbedForBrowser).not.toContain('name-499');

    // SSR rendered the elements the stubs stand for.
    const html = await ssr(stubbed);
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    expect(container.querySelectorAll('tr').length).toBe(ROWS);
    const table = container.querySelector('table');
    const button = container.querySelector('button');

    // Hydrate from the stripped payload. Any mismatch warning fails the test
    // (console.error is asserted to be empty by the test setup).
    const response = consume(stubbedForBrowser);
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

    // A later (non stubbed) payload replaces the adopted region.
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

  // A page with a client component and a static table.
  function sharedAppElement(count) {
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

    return <App size={count} />;
  }

  // `flightOpts` is undefined (no option) or {htmlFirst: false} (SPA nav).
  async function renderSharedApp(count, ...rest) {
    const flightOpts = rest.length ? rest[0] : {htmlFirst: true};
    return serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(
          sharedAppElement(count),
          webpackMap,
          flightOpts,
        ),
      ),
    );
  }

  it('SSRs and hydrates with a tee and no htmlFirst or htmlFirstRows', async () => {
    const ROWS = 50;
    // The tee's reader renders the HTML from the elements the server stubbed.
    const {main, html} = await renderWithTee(sharedAppElement(ROWS));
    expect(main).toContain(':P');
    expect(main).toContain('$J');
    expect(main).not.toContain('name-49');
    expect(html).toContain('name-49');
    expect(html).toContain('clicks');

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const table = container.querySelector('table');
    const button = container.querySelector('button');

    // The browser reads the bytes only → stubs → adopt HTML.
    const response = consume(main);
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

  it('does not stub unless the request opts in', async () => {
    const main = await renderSharedApp(10, undefined);
    expect(main).not.toContain('$J');
    expect(main).not.toContain(':P');
    expect(main).toContain('name-9');
    const off = await renderSharedApp(10, {htmlFirst: false});
    expect(off).not.toContain('$J');
    expect(off).not.toContain(':P');
    expect(off).toContain('name-9');
  });

  it('writes nothing extra when there is nothing to stub', async () => {
    const Counter = clientExports(function Counter({label}) {
      return <button>{label}</button>;
    });
    const render = opts =>
      serverAct(async () =>
        readAll(
          ReactServerDOMServer.renderToReadableStream(
            <Counter label="only-client" />,
            webpackMap,
            opts,
          ),
        ),
      );
    // Rendered from one call site with the DEV timestamp row dropped, so
    // debug info cannot differ between the two.
    const options = [{htmlFirst: true}, undefined];
    const outputs = [];
    for (let i = 0; i < options.length; i++) {
      outputs.push(await render(options[i]));
    }
    const [main, stock] = outputs;
    const withoutTime = text => text.replace(/^:N.*\n/gm, '');
    expect(withoutTime(main)).toBe(withoutTime(stock));
    expect(main).not.toContain(':P');

    const html = await ssr({main});
    expect(html).toContain('only-client');
  });

  it('reads a tee in a runtime without AsyncLocalStorage', async () => {
    const had = 'AsyncLocalStorage' in globalThis;
    const saved = globalThis.AsyncLocalStorage;
    // The Edge client captures the reader's context only where it exists.
    delete globalThis.AsyncLocalStorage;
    try {
      const {main, html} = await renderWithTee(sharedAppElement(5));
      expect(main).toContain('$J');
      expect(main).not.toContain('name-4');
      expect(html).toContain('name-4');
      expect(html).toContain('clicks');
    } finally {
      if (had) {
        globalThis.AsyncLocalStorage = saved;
      }
    }
  });

  it('writes the request id before the first stub that needs it', async () => {
    const Counter = clientExports(function Counter({label}) {
      return <button>{label}</button>;
    });
    async function Late() {
      await null;
      return (
        <section>
          <p data-fill={FILL}>late-static</p>
        </section>
      );
    }
    function App() {
      return (
        <div>
          <Counter label="first" />
          <React.Suspense fallback={<p>loading</p>}>
            <Late />
          </React.Suspense>
        </div>
      );
    }
    const {main, html} = await renderWithTee(<App />);
    const rows = main.split('\n');
    const root = rows.findIndex(row => row.startsWith('0:'));
    const id = rows.findIndex(row => row.startsWith(':P'));
    const stub = rows.findIndex(row => row.includes('$J'));
    // The root row is written before anything is stubbed, so it comes first.
    expect(root).not.toBe(-1);
    expect(id).toBeGreaterThan(root);
    expect(stub).toBeGreaterThan(id);
    expect(main).not.toContain('late-static');

    expect(html).toContain('late-static');
    expect(html).toContain('first');
  });

  it('makes the payload id when the tee is created, not during the render', async () => {
    // Next.js treats randomness read during a Cache Components render as sync
    // IO, which ends the staged render early and keeps the response open.
    const Counter = clientExports(function Counter({label}) {
      const [n, setN] = React.useState(0);
      return (
        <button onClick={() => setN(n + 1)}>
          {label}:{n}
        </button>
      );
    });
    function App() {
      return (
        <main>
          <Counter label="clicks" />
          <table className="data">
            <tbody>
              {Array.from({length: 20}, (_, i) => (
                <tr key={i}>
                  <td>{'name-' + i}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </main>
      );
    }
    const tee = ReactServerDOMEdgeClient.createTee(createTeeManifest());
    const realRandom = Math.random;
    const cryptoObject = globalThis.crypto;
    const hadOwnGetRandomValues = Object.prototype.hasOwnProperty.call(
      cryptoObject,
      'getRandomValues',
    );
    const realGetRandomValues = cryptoObject.getRandomValues;
    let main, html;
    try {
      Math.random = () => {
        throw new Error('Math.random during the render');
      };
      Object.defineProperty(cryptoObject, 'getRandomValues', {
        configurable: true,
        writable: true,
        value: () => {
          throw new Error('crypto.getRandomValues during the render');
        },
      });
      let htmlDone;
      const htmlFirst = new Promise((resolve, reject) => {
        htmlDone = {resolve, reject};
      });
      ({main, html} = await serverAct(async () => {
        const stream = ReactServerDOMServer.renderToReadableStream(
          <App />,
          webpackMap,
          {htmlFirst, tee},
        );
        const browser = readAll(stream);
        let response = null;
        function TeeRoot() {
          if (response === null) {
            response = ReactServerDOMEdgeClient.createFromTee(tee);
          }
          return <Shell response={response} />;
        }
        const htmlStream = await ReactDOMFizzServer.renderToReadableStream(
          <TeeRoot />,
        );
        await htmlStream.allReady;
        htmlDone.resolve();
        return {main: await browser, html: await readAll(htmlStream)};
      }));
    } finally {
      Math.random = realRandom;
      if (hadOwnGetRandomValues) {
        cryptoObject.getRandomValues = realGetRandomValues;
      } else {
        delete cryptoObject.getRandomValues;
      }
    }
    expect(main).toMatch(/^:P[0-9a-f]+$/m);
    expect(main).toContain('$J');
    expect(main).not.toContain('name-19');
    expect(html).toContain('name-19');

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const table = container.querySelector('table');
    const response = consume(main);
    await response;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <Shell response={response} />);
    });
    expect(container.querySelector('table')).toBe(table);
    expect(container.querySelectorAll('tr').length).toBe(20);
  });

  it('stubs nothing without a tee', async () => {
    const element = sharedAppElement(5);
    // Rendered from one call site, so debug info can't differ in the stack.
    const options = [undefined, {htmlFirst: true}, {htmlFirst: false}];
    const outputs = [];
    for (let i = 0; i < options.length; i++) {
      outputs.push(
        await serverAct(async () =>
          readAll(
            ReactServerDOMServer.renderToReadableStream(
              element,
              webpackMap,
              options[i],
            ),
          ),
        ),
      );
    }
    // No tee: nothing renders the stubbed elements, so the option is a no-op.
    const withoutTime = text =>
      text.replace(/^[0-9a-f]*:(N|D\{"time").*\n/gm, '');
    const [stock, on, off] = outputs;
    expect(withoutTime(on)).toBe(withoutTime(stock));
    expect(withoutTime(off)).toBe(withoutTime(stock));
    expect(on).not.toContain('$J');
    expect(on).not.toContain(':P');
    expect(on).toContain('name-4');
  });

  it('gives each concurrent tee its own rows', async () => {
    const [a, b] = await serverAct(() =>
      Promise.all([
        renderWithTeeInner(sharedAppElement(3)),
        renderWithTeeInner(sharedAppElement(7)),
      ]),
    );
    expect(a.main).toMatch(/:P[0-9a-f]+\n/);
    expect(b.main).toMatch(/:P[0-9a-f]+\n/);
    const idA = a.main.match(/:P([0-9a-f]+)\n/)[1];
    const idB = b.main.match(/:P([0-9a-f]+)\n/)[1];
    expect(idA).not.toBe(idB);
    expect(a.html).toContain('name-2');
    expect(a.html).not.toContain('name-6');
    expect(b.html).toContain('name-6');
    expect(b.html.match(/name-\d+/g).length).toBe(7);
    expect(a.main).not.toContain('name-2');
    expect(b.main).not.toContain('name-6');
  });

  it('SPA navigation uses htmlFirst: false for a full payload', async () => {
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

    const {main, html} = await renderWithTee(<App size={ROWS} />);
    expect(main).toContain('$J');
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const table = container.querySelector('table');
    const button = container.querySelector('button');
    const response = consume(main);
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
    const nextMain = await renderOnce({htmlFirst: false});
    expect(nextMain).not.toContain('$J');
    expect(nextMain).not.toContain(':P');
    const nextResponse = consume(nextMain);
    await nextResponse;
    await act(() => {
      root.render(<Shell response={nextResponse} />);
    });
    expect(container.querySelectorAll('tr').length).toBe(ROWS);
    // The payload has the content the stubs adopted, so their DOM stays.
    expect(container.querySelector('table')).toBe(table);
    expect(container.querySelector('button')).toBe(button);
  });

  it('navigation to different content replaces the stubbed regions', async () => {
    const Counter = clientExports(function Counter() {
      const [n, setN] = React.useState(0);
      return <button onClick={() => setN(n + 1)}>c:{n}</button>;
    });
    const Page = ({v}) => (
      <main>
        <h1 className={v}>{'Title ' + v}</h1>
        <Counter />
        <section data-fill={FILL}>
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
    const first = await flight(<Page v="a" />);
    expect(first.main).toContain('$J');
    const {container, root, errors} = await hydrate(first.main, first.html);
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

  describe('a full payload in place of the stubs', () => {
    let ClientCounter;
    beforeEach(() => {
      ClientCounter = clientExports(function Counter() {
        const [n, setN] = React.useState(0);
        return <button onClick={() => setN(n + 1)}>c:{n}</button>;
      });
    });

    function Page({title, rows, rowClass, color, extra}) {
      return (
        <main>
          <h1 title={title}>
            {'Report'} {rows.length}
          </h1>
          <ClientCounter />
          <table
            className="data"
            style={{color, borderWidth: 1}}
            hidden={false}>
            <tbody>
              {rows.map(name => (
                <tr key={name} className={rowClass}>
                  <td data-name={name}>{name}</td>
                  <td>
                    <a href={'/' + name}>open</a>
                    <br />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {extra}
        </main>
      );
    }

    const base = {
      title: 'a "b" & c',
      rows: ['one', 'two', 'three'],
      rowClass: 'row',
      color: 'red',
    };

    async function hydratePage(props = base) {
      const first = await flight(<Page {...props} />);
      expect(first.main).toContain('$J');
      const html = await ssr(first);
      const result = await hydrate(first.main, html);
      const container = result.container;
      const nodes = Array.from(container.querySelectorAll('*'));
      const texts = [];
      const walker = document.createTreeWalker(container, 4);
      while (walker.nextNode()) {
        texts.push(walker.currentNode);
      }
      const mutations = new MutationObserver(() => {});
      mutations.observe(container, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      return {...result, html: container.innerHTML, nodes, texts, mutations};
    }

    it('keeps the adopted DOM when the content is the same', async () => {
      const {container, root, errors, html, nodes, texts, mutations} =
        await hydratePage();
      await act(() => container.querySelector('button').click());
      const clicked = container.innerHTML;
      expect(clicked).toBe(html.replace('c:<!-- -->0', 'c:<!-- -->1'));
      mutations.takeRecords();

      await renderFullPayload(root, <Page {...base} />);
      expect(errors).toEqual([]);
      expect(mutations.takeRecords()).toEqual([]);
      expect(container.innerHTML).toBe(clicked);
      expect(Array.from(container.querySelectorAll('*'))).toEqual(nodes);
      nodes.concat(texts).forEach(node => expect(node.isConnected).toBe(true));

      // And again: the stubs are still there to compare with.
      await renderFullPayload(root, <Page {...base} />);
      expect(mutations.takeRecords()).toEqual([]);
      expect(container.querySelector('table')).toBe(nodes[3]);
      expect(nodes[3].nodeName).toBe('TABLE');

      // Content that changes after it was kept is rendered.
      await renderFullPayload(root, <Page {...base} rowClass="other" />);
      expect(errors).toEqual([]);
      expect(container.querySelector('tr').className).toBe('other');
      await renderFullPayload(root, <Page {...base} rowClass="third" />);
      expect(container.querySelector('tr').className).toBe('third');
      expect(container.querySelector('button').textContent).toBe('c:1');
    });

    it('keeps the adopted DOM of content the full payload splits into rows', async () => {
      const props = {
        ...base,
        rows: Array.from({length: 100}, (_, i) => i + '-'.repeat(200)),
      };
      const {container, root, errors, nodes, mutations} =
        await hydratePage(props);
      const full = await flight(<Page {...props} />, false);
      // The table is not one row of the payload.
      expect(full.main.split('\n').length).toBeGreaterThan(10);
      const response = consume(full.main);
      await response;
      await act(() => root.render(<Shell response={response} />));
      expect(errors).toEqual([]);
      expect(mutations.takeRecords()).toEqual([]);
      expect(Array.from(container.querySelectorAll('*'))).toEqual(nodes);
    });

    it('keeps the adopted DOM when rows of the full payload arrive later', async () => {
      const props = {
        ...base,
        rows: Array.from({length: 100}, (_, i) => i + '-'.repeat(200)),
      };
      const {container, root, errors, nodes, mutations} =
        await hydratePage(props);
      const full = await flight(<Page {...props} />, false);
      const lines = full.main.split('\n');
      const half = Math.floor(lines.length / 2);
      let controller;
      const stream = new ReadableStream({
        start(c) {
          controller = c;
        },
      });
      controller.enqueue(
        encoder.encode(lines.slice(0, half).join('\n') + '\n'),
      );
      const response = ReactServerDOMClient.createFromReadableStream(stream);
      // Rendered while half of the rows are still pending lazy nodes.
      await act(() => root.render(<Shell response={response} />));
      await act(() => {
        controller.enqueue(encoder.encode(lines.slice(half).join('\n')));
        controller.close();
      });
      expect(errors).toEqual([]);
      expect(container.querySelectorAll('tr').length).toBe(100);
      expect(mutations.takeRecords()).toEqual([]);
      expect(Array.from(container.querySelectorAll('*'))).toEqual(nodes);
    });

    it.each([
      ['text', {rows: ['one', 'two', 'four']}],
      ['an attribute', {rowClass: 'row selected'}],
      ['an attribute of the stub itself', {title: 'other'}],
      ['a removed attribute', {rowClass: undefined}],
      ['a style', {color: 'blue'}],
      ['a removed style', {color: undefined}],
      ['more children', {rows: ['one', 'two', 'three', 'four']}],
      ['fewer children', {rows: ['one', 'two']}],
      ['the order of children', {rows: ['two', 'one', 'three']}],
    ])('renders the new content when %s differs', async (_, changes) => {
      const {container, root, errors} = await hydratePage();
      const button = container.querySelector('button');
      const props = {...base, ...changes};
      await renderFullPayload(root, <Page {...props} />);
      expect(errors).toEqual([]);
      expect(container.querySelector('button')).toBe(button);

      // The same as rendering that payload from scratch.
      const full = await flight(<Page {...props} />, false);
      const response = consume(full.main);
      await response;
      const expected = document.createElement('div');
      const expectedRoot = ReactDOMClient.createRoot(expected);
      await act(() => expectedRoot.render(<Shell response={response} />));
      expect(expected.querySelectorAll('tr').length).toBe(props.rows.length);
      // Apart from how the server HTML that stayed writes text and styles.
      const actual = container.cloneNode(true);
      actual.querySelectorAll('[style]').forEach(node => {
        node.setAttribute('style', node.style.cssText);
      });
      expect(withoutMarkers(actual.innerHTML).replace(/<!-- -->/g, '')).toBe(
        expected.innerHTML,
      );
    });

    it('renders the new content when the DOM was changed', async () => {
      const {container, root, errors} = await hydratePage();
      const table = container.querySelector('table');
      const h1 = container.querySelector('h1');
      container.querySelector('td').setAttribute('data-name', 'changed');
      await renderFullPayload(root, <Page {...base} />);
      expect(errors).toEqual([]);
      // Patched in place: the changed attribute is put back, the table kept.
      expect(container.querySelector('table')).toBe(table);
      expect(container.querySelector('td').getAttribute('data-name')).toBe(
        'one',
      );
      expect(container.querySelector('h1')).toBe(h1);
    });

    it('patches changed static content in place, keeping the rest', async () => {
      const {container, root, errors} = await hydratePage();
      const table = container.querySelector('table');
      const rows = Array.from(container.querySelectorAll('tr'));
      const links = Array.from(container.querySelectorAll('a'));
      await renderFullPayload(
        root,
        <Page {...base} rows={['one', 'TWO', 'three']} />,
      );
      expect(errors).toEqual([]);
      expect(container.querySelector('table')).toBe(table);
      const after = Array.from(container.querySelectorAll('tr'));
      expect(after[0]).toBe(rows[0]);
      expect(after[1]).toBe(rows[1]);
      expect(after[2]).toBe(rows[2]);
      expect(container.querySelectorAll('a')[0]).toBe(links[0]);
      expect(after[1].querySelector('td').textContent).toBe('TWO');
      expect(after[1].querySelector('td').getAttribute('data-name')).toBe(
        'TWO',
      );
      expect(after[1].querySelector('a').getAttribute('href')).toBe('/TWO');
    });

    it('renders the new content when it is not static', async () => {
      const {container, root, errors} = await hydratePage();
      const table = container.querySelector('table');
      await renderFullPayload(
        root,
        <Page {...base} extra={<ClientCounter />} />,
      );
      expect(errors).toEqual([]);
      expect(container.querySelector('table')).toBe(table);
      expect(container.querySelectorAll('button').length).toBe(2);
    });
  });

  it('stubs static output under the entries of a root element map', async () => {
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
    const full = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(model, webpackMap, {
          htmlFirst: false,
        }),
      ),
    );
    // SSR renders both entries, so the server writes no late row for them.
    function MapShell({response}) {
      const map = use(response);
      return (
        <>
          {map.page}
          {use(map.later)}
        </>
      );
    }
    const {main, html} = await renderWithTee(model, undefined, MapShell);
    expect(main.length).toBeLessThan(full.length / 10);
    expect(main).not.toContain('name-99');
    expect(html).toContain('name-99');
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const table = container.querySelector('table');
    const bResponse = consume(main);
    await bResponse;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <MapShell response={bResponse} />);
    });
    expect(container.querySelector('table')).toBe(table);
    expect(container.querySelectorAll('tr').length).toBe(200);
  });

  it('stubs static output nested in plain data around elements', async () => {
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
    // A route tree like Next.js sends: segment data in objects and a Map.
    const model = {
      tree: {
        data: {rsc: <h1>{'layout-heading' + FILL}</h1>},
        slots: new Map([['children', {data: {rsc: <Page />}}]]),
      },
    };
    const full = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(model, webpackMap, {
          htmlFirst: false,
        }),
      ),
    );
    function TreeShell({response}) {
      const tree = use(response).tree;
      return (
        <>
          {tree.data.rsc}
          {tree.slots.get('children').data.rsc}
        </>
      );
    }
    const {main, html} = await renderWithTee(model, undefined, TreeShell);
    expect(main.length).toBeLessThan(full.length / 10);
    expect(main).not.toContain('name-99');
    expect(main).not.toContain('layout-heading');
    expect(html).toContain('layout-heading');
    expect(html).toContain('name-99');
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const table = container.querySelector('table');
    const bResponse = consume(main);
    await bResponse;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <TreeShell response={bResponse} />);
    });
    expect(container.querySelector('table')).toBe(table);
    expect(container.querySelectorAll('tr').length).toBe(100);
  });

  it('stubs the children of a keyed Fragment', async () => {
    const Counter = clientExports(function Counter() {
      return <button>count</button>;
    });
    // Next.js wraps each route segment's output like this.
    const model = {
      page: (
        <React.Fragment key="c">
          <main>
            <h1>{'fragment-heading' + FILL}</h1>
            <Counter />
          </main>
        </React.Fragment>
      ),
    };
    function PageShell({response}) {
      return use(response).page;
    }
    const {main, html} = await renderWithTee(model, undefined, PageShell);
    expect(main).toContain('$J');
    expect(main).not.toContain('fragment-heading');
    expect(html).toContain('fragment-heading');
    expect(html).toContain('count');
  });

  it('never stubs a void element on its own', async () => {
    const Counter = clientExports(function Counter() {
      return <button>count</button>;
    });
    function App() {
      return (
        <main>
          <Counter />
          <hr />
          <p data-fill={FILL}>
            line-one
            <br />
            line-two
          </p>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    // The <hr> stays inline; the <p> around the <br> is still stubbed.
    expect(main).not.toMatch(/\$J[0-9a-f]+:hr/);
    expect(main).toMatch(/\$J[0-9a-f]+:p/);
    expect(main).not.toContain('line-one');
    expect(html).toContain('<hr/>');
    const {container, errors} = await hydrate(main, html);
    expect(errors).toEqual([]);
    expect(container.querySelector('hr')).not.toBe(null);
    expect(container.textContent).toContain('line-two');
  });

  it('never stubs an element whose tag contains a colon', async () => {
    const Counter = clientExports(function Counter() {
      return <button>count</button>;
    });
    function App() {
      return (
        <main>
          <Counter />
          {React.createElement('x:y', null, 'namespaced')}
          <p>{'plain' + FILL}</p>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    // The stub is "$J<id>:<tag>[:<key>]", which can't carry this tag.
    expect(main).not.toMatch(/\$J[0-9a-f]+:x/);
    expect(main).toContain('x:y');
    expect(main).toMatch(/\$J[0-9a-f]+:p/);
    const {container, errors} = await hydrate(main, html);
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('namespaced');
  });

  it('leaves a tiny static element in the payload', async () => {
    const Counter = clientExports(function Counter() {
      return <button>count</button>;
    });
    function App() {
      return (
        <main>
          <Counter />
          <span>label</span>
          <p>{'long-sentence' + FILL}</p>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    // The span would take less room as a stub than as an element.
    expect(main).not.toMatch(/\$J[0-9a-f]+:span/);
    expect(main).toContain('label');
    expect(main).toMatch(/\$J[0-9a-f]+:p"/);
    expect(main).not.toContain('long-sentence');
    const {container, errors} = await hydrate(main, html);
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('label');
    expect(container.textContent).toContain('long-sentence' + FILL);
  });

  it('leaves a small element with few host nodes in the payload', async () => {
    const Counter = clientExports(function Counter() {
      return <button>count</button>;
    });
    function App() {
      return (
        <main>
          <Counter />
          <p>{'medium-sentence that is over the minimum weight but not big'}</p>
          <pre>{'long-block'.repeat(60)}</pre>
          <ul>
            <li>one</li>
            <li>two</li>
            <li>three</li>
            <li>four</li>
          </ul>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    // The <p> has two nodes and under 512 bytes, the <pre> has two nodes but a
    // large text, and the <ul> nine nodes.
    expect(main).toContain('medium-sentence');
    expect(main).not.toMatch(/\$J[0-9a-f]+:p"/);
    expect(main).toMatch(/\$J[0-9a-f]+:pre"/);
    expect(main).toMatch(/\$J[0-9a-f]+:ul"/);
    const {container, errors} = await hydrate(main, html);
    expect(errors).toEqual([]);
    expect(container.querySelectorAll('li').length).toBe(4);
    expect(container.querySelector('pre').textContent).toBe(
      'long-block'.repeat(60),
    );
  });

  it('stubs a small element that is mostly attributes', async () => {
    const Counter = clientExports(function Counter() {
      return <button>count</button>;
    });
    function App() {
      return (
        <main>
          <Counter />
          <span
            data-first="aaaaaaaaaaaaaaaaaaaa"
            data-second="bbbbbbbbbbbbbbbbbbbb"
            data-third="cccccccccccccccccccc">
            x
          </span>
          <p>{'medium-sentence that is over the minimum weight but not big'}</p>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    // The <span> has two nodes and under 512 bytes, but its attributes take 80
    // bytes. The <p> has as many bytes, nearly all of them text.
    expect(main).toMatch(/\$J[0-9a-f]+:span"/);
    expect(main).not.toContain('data-first');
    expect(main).toContain('medium-sentence');
    const {container, errors} = await hydrate(main, html);
    expect(errors).toEqual([]);
    expect(container.querySelector('span').getAttribute('data-third')).toBe(
      'cccccccccccccccccccc',
    );
  });

  it('stubs an element that is made of many tiny ones', async () => {
    const Counter = clientExports(function Counter() {
      return <button>count</button>;
    });
    function App() {
      return (
        <main>
          <Counter />
          <ul>
            {Array.from({length: 20}, (_, i) => (
              <li key={i}>x</li>
            ))}
          </ul>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    // The subtree counts, so the <ul> is one stub and no <li> is in the bytes.
    expect(main).toMatch(/\$J[0-9a-f]+:ul"/);
    expect(main.match(/\$J[0-9a-f]+:/g).length).toBe(1);
    expect(main).not.toContain('"li"');
    const {container, errors} = await hydrate(main, html);
    expect(errors).toEqual([]);
    expect(container.querySelectorAll('li').length).toBe(20);
  });

  it('adopts a stubbed element that has no inline style', async () => {
    const Counter = clientExports(function Counter() {
      return <button>count</button>;
    });
    function App() {
      return (
        <main>
          <Counter />
          <math>
            <mi title={FILL}>x</mi>
            <mo>+</mo>
          </math>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    // <math> is never stubbed, but its children are.
    expect(main).toMatch(/\$J[0-9a-f]+:mi/);
    const {container, errors} = await hydrate(main, html);
    expect(errors).toEqual([]);
    expect(container.querySelector('mi').textContent).toBe('x');
    expect(container.querySelector('mo').textContent).toBe('+');
  });

  it('restores stubbed content from the adopted DOM when it mounts again', async () => {
    function App() {
      return (
        <main className="page" data-kind="static" data-fill={FILL}>
          <h1>restore-heading</h1>
          <p>restore-text</p>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    expect(main).toMatch(/\$J[0-9a-f]+:main/);
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const missing = [];
    const response = consume(main, {
      onMissingHTML: () => missing.push('missing'),
    });
    await response;
    let root;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(
        container,
        <Shell response={response} />,
      );
    });
    expect(container.querySelector('h1').textContent).toBe('restore-heading');
    // Navigate away and back: the cached payload renders again on the client.
    await act(() => root.render(<p>elsewhere</p>));
    expect(container.textContent).toBe('elsewhere');
    await act(() => root.render(<Shell response={response} />));
    expect(missing).toEqual([]);
    const restored = container.querySelector('main');
    expect(restored.className).toBe('page');
    expect(restored.getAttribute('data-kind')).toBe('static');
    expect(restored.querySelector('h1').textContent).toBe('restore-heading');
    expect(restored.textContent).toBe('restore-headingrestore-text');
  });

  it('restores from the adopted DOM in another decode of the same payload', async () => {
    function App() {
      return (
        <main className="page" data-fill={FILL}>
          <h1>shared-heading</h1>
          <p>shared-text</p>
        </main>
      );
    }
    // The payload carries its :P id, which the decodes share.
    const {main, html} = await renderWithTee(<App />);
    expect(main).toMatch(/:P[0-9a-f]+\n/);
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const missing = [];
    const onMissingHTML = () => missing.push('missing');
    const first = consume(main, {onMissingHTML});
    await first;
    let root;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(container, <Shell response={first} />);
    });
    // A framework decodes the payload again for its cache and renders that
    // copy later, after the page was replaced.
    const second = consume(main, {onMissingHTML});
    await second;
    await act(() => root.render(<p>elsewhere</p>));
    await act(() => root.render(<Shell response={second} />));
    expect(missing).toEqual([]);
    expect(container.querySelector('main').className).toBe('page');
    expect(container.textContent).toBe('shared-headingshared-text');
  });

  describe('inside a hidden Activity', () => {
    async function hydrateStubbed(App) {
      function Page({mode, response}) {
        return (
          <React.Activity mode={mode}>
            <Shell response={response} />
          </React.Activity>
        );
      }
      const {main, html} = await renderWithTee(
        <App />,
        undefined,
        ({response}) => <Page mode="visible" response={response} />,
      );
      expect(main).toContain('$J');
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = html;
      const response = consume(main, {
        onMissingHTML: () => {
          throw new Error('missing');
        },
      });
      await response;
      let root;
      await act(() => {
        root = ReactDOMClient.hydrateRoot(
          container,
          <Page mode="visible" response={response} />,
        );
      });
      return {container, root, Page, response};
    }

    it('keeps the inline display of a stubbed element through hide and show', async () => {
      function App() {
        return (
          <section style={{display: 'flex'}} data-fill={FILL}>
            <p>flex-child</p>
          </section>
        );
      }
      const {container, root, Page, response} = await hydrateStubbed(App);
      const section = container.querySelector('section');
      expect(section.style.display).toBe('flex');
      await act(() => root.render(<Page mode="hidden" response={response} />));
      expect(section.style.display).toBe('none');
      await act(() => root.render(<Page mode="visible" response={response} />));
      expect(container.querySelector('section')).toBe(section);
      expect(section.style.display).toBe('flex');
    });

    it('is visible when it mounts again after it was unmounted while hidden', async () => {
      function App() {
        return <h2>{'page-heading' + FILL}</h2>;
      }
      const {container, root, Page, response} = await hydrateStubbed(App);
      await act(() => root.render(<Page mode="hidden" response={response} />));
      expect(container.querySelector('h2').style.display).toBe('none');
      // Evicted while hidden, then rendered again from the same payload.
      await act(() => root.render(<p>elsewhere</p>));
      await act(() =>
        root.render(
          <React.Activity mode="visible">
            <Shell response={response} />
          </React.Activity>,
        ),
      );
      const h2 = container.querySelector('h2');
      expect(h2.textContent).toBe('page-heading' + FILL);
      expect(h2.style.display).toBe('');
    });
  });

  it('lets the detached node go and restores from a snapshot', async () => {
    function App() {
      return (
        <main className="page" data-fill={FILL}>
          <h1>snapshot-heading</h1>
        </main>
      );
    }
    const {main, html} = await flight(<App />);
    expect(main).toContain('$J');
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const missing = [];
    const response = consume(main, {
      onMissingHTML: () => missing.push('missing'),
    });
    await response;
    let root;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(
        container,
        <Shell response={response} />,
      );
    });
    const old = container.querySelector('main');
    await act(() => root.render(<p>elsewhere</p>));
    // The stub doesn't read the detached node again.
    old.querySelector('h1').textContent = 'changed-after-unmount';
    await act(() => root.render(<Shell response={response} />));
    expect(missing).toEqual([]);
    const restored = container.querySelector('main');
    expect(restored).not.toBe(old);
    expect(restored.className).toBe('page');
    expect(restored.textContent).toBe('snapshot-heading');
  });

  // Returns {main, html}: rendered with a tee (html) or in full (no html).
  async function flight(element, stub = true) {
    if (stub) {
      return renderWithTee(element);
    }
    const main = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(element, webpackMap, {
          htmlFirst: false,
        }),
      ),
    );
    return {main, html: undefined};
  }

  // Like `flight`, but the render is aborted once the HTML is done, so the
  // server writes no late row: a stub whose content SSR did not render has
  // nothing to adopt and nothing to restore from.
  async function flightWithoutLateRows(element) {
    const controller = new AbortController();
    return serverAct(async () => {
      const t = startTee(element, {signal: controller.signal, onError() {}});
      const htmlStream = await t.renderHTML();
      await htmlStream.allReady;
      const html = await readAll(htmlStream);
      controller.abort(new Error('aborted'));
      return {main: await t.browser, html};
    });
  }

  // Hydrates `html` with the browser payload `main`.
  // `flightOptions` go to createFromReadableStream (e.g. onMissingHTML).
  // `rootOptions` go to hydrateRoot.
  async function hydrate(main, html, flightOptions, rootOptions) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const errors = [];
    const response = consume(main, flightOptions);
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

  // Framework recovery: replace the tree with a full, non-stubbed payload.
  async function renderFullPayload(root, app) {
    const full = await flight(app, false);
    expect(full.main).not.toContain('$J');
    const response = consume(full.main);
    await response;
    await act(() => root.render(<Shell response={response} />));
  }

  it('does not stub host elements passed as props to a client component', async () => {
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
    expect(f.main).not.toContain('$J');
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('panel-A');
    await act(() => container.querySelector('button').click());
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('panel-B');
  });

  it('restores a server panel that client Tabs unmounted, without a request', async () => {
    const Tabs = clientExports(function Tabs({children}) {
      const [tab, setTab] = React.useState('server');
      return (
        <section>
          <button onClick={() => setTab('server')}>server</button>
          <button onClick={() => setTab('client')}>client</button>
          {tab === 'server' ? children : <p>client-panel</p>}
        </section>
      );
    });
    const App = () => (
      <Tabs>
        <article className="panel">
          <h2>{'server-panel' + FILL}</h2>
        </article>
      </Tabs>
    );
    const f = await flight(<App />);
    // The article is a child of a Client Component, so it is real. Its child
    // is stubbed.
    expect(f.main).not.toMatch(/\$J[0-9a-f]+:article/);
    expect(f.main).toMatch(/\$J[0-9a-f]+:h2/);
    const html = await ssr(f);
    const missing = jest.fn();
    const {container, errors} = await hydrate(f.main, html, {
      onMissingHTML: missing,
    });
    const [serverTab, clientTab] = container.querySelectorAll('button');
    const adopted = container.querySelector('h2');
    for (let i = 0; i < 3; i++) {
      await act(() => clientTab.click());
      expect(container.querySelector('article')).toBe(null);
      expect(container.textContent).toContain('client-panel');
      await act(() => serverTab.click());
      const article = container.querySelector('article');
      expect(article.querySelector('h2')).not.toBe(adopted);
      expect(article.outerHTML).toBe(
        '<article class="panel"><h2>server-panel' + FILL + '</h2></article>',
      );
    }
    expect(missing).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
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

  it('keeps keyed children of a client list real and stubs their children; reorder moves adopted DOM', async () => {
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
        <li key="x">
          <b title={FILL}>x</b>
        </li>
        <li key="y">
          <b title={FILL}>y</b>
        </li>
        <li key="z">
          <b title={FILL}>z</b>
        </li>
      </List>
    );
    const f = await flight(<App />);
    expect(f.main).not.toMatch(/\$J[0-9a-f]+:li/);
    expect(f.main).toMatch(/\$J[0-9a-f]+:b"/);
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    expect(container.querySelector('ul').textContent).toBe('xyz');
    await act(() => container.querySelector('button').click());
    expect(errors).toEqual([]);
    expect(container.querySelector('ul').textContent).toBe('zyx');
  });

  it('stubs client-panel children and recovers when they mount without server DOM', async () => {
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
        <div>
          <p>{'modal-body' + FILL}</p>
        </div>
      </Panel>
    );
    // No late row, so the stub of the closed panel has nothing to adopt.
    const f = await flightWithoutLateRows(<App />);
    expect(f.main).toMatch(/\$J[0-9a-f]+:p"/);
    expect(f.main).not.toMatch(/\$J[0-9a-f]+:div/);
    expect(f.main).not.toContain('modal-body');
    const html = await ssr(f);
    const missing = jest.fn();
    const {container, errors, root} = await hydrate(f.main, html, {
      onMissingHTML: () => {
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

  describe('late rows', () => {
    // What a framework does: the Flight stream is rendered to HTML in this
    // process while it is also sent to the browser. Returns the browser's
    // payload and the HTML.
    function flightAndSsr(element, options) {
      return renderWithTee(element, options);
    }

    function createPanel() {
      return clientExports(function Panel({children}) {
        const [open, setOpen] = React.useState(false);
        return (
          <div>
            <button onClick={() => setOpen(!open)}>toggle</button>
            {open ? <aside>{children}</aside> : null}
          </div>
        );
      });
    }

    it('sends the rows SSR did not render, so a closed modal opens without a round trip', async () => {
      const Panel = createPanel();
      const App = () => (
        <main>
          <article>{'page-content '.repeat(50)}</article>
          <Panel>
            <div>
              <p>{'modal-body' + FILL}</p>
            </div>
          </Panel>
        </main>
      );
      const {main, html} = await flightAndSsr(<App />);
      expect(html).toContain('page-content');
      expect(html).not.toContain('modal-body');
      // The article is in the HTML and stays out of the payload. The modal's
      // content is not, so its row was written after all.
      expect(main).not.toContain('page-content');
      expect(main).toContain('modal-body');
      // One row, after the rest of the payload. In DEV it comes with its
      // debug info.
      const lateRows = main
        .split('\n')
        .filter(row => row.includes('modal-body'));
      expect(lateRows.length).toBe(1);
      const lateBytes = byteLength(lateRows[0]);
      console.log(
        `late rows: stream=${byteLength(main)} the modal's row=${lateBytes}`,
      );
      expect(lateBytes).toBeLessThan(byteLength(FILL) + (__DEV__ ? 400 : 80));

      const missing = jest.fn();
      const {container, errors} = await hydrate(main, html, {
        onMissingHTML: missing,
      });
      expect(container.innerHTML).toBe(html);
      expect(container.textContent).not.toContain('modal-body');
      await act(() => container.querySelector('button').click());
      expect(container.querySelector('aside').innerHTML).toBe(
        '<div><p>modal-body' + FILL + '</p></div>',
      );
      // Closing and opening it again doesn't need the server either.
      await act(() => container.querySelector('button').click());
      expect(container.querySelector('aside')).toBe(null);
      await act(() => container.querySelector('button').click());
      expect(container.querySelector('aside').innerHTML).toBe(
        '<div><p>modal-body' + FILL + '</p></div>',
      );
      expect(missing).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('sends the rows of a client-only wrapper', async () => {
      const ClientOnly = clientExports(function ClientOnly({children}) {
        const [mounted, setMounted] = React.useState(false);
        React.useEffect(() => setMounted(true), []);
        return mounted ? children : null;
      });
      const App = () => (
        <div>
          <ClientOnly>
            <section>
              <p>{'client-only-content' + FILL}</p>
            </section>
          </ClientOnly>
        </div>
      );
      const {main, html} = await flightAndSsr(<App />);
      expect(main).toContain('$J');
      // The section is real; the late row is its child's.
      expect(main).not.toMatch(/\$J[0-9a-f]+:section/);
      expect(main).toContain('client-only-content');
      expect(html).not.toContain('client-only-content');
      const missing = jest.fn();
      const {container, errors} = await hydrate(main, html, {
        onMissingHTML: missing,
      });
      expect(container.innerHTML).toBe(
        '<div><section><p>client-only-content' + FILL + '</p></section></div>',
      );
      expect(missing).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('sends the row of a tab panel SSR did not render, so every tab opens without a round trip', async () => {
      const Tabs = clientExports(function Tabs({children}) {
        const [tab, setTab] = React.useState(0);
        return (
          <section>
            <button onClick={() => setTab(0)}>a</button>
            <button onClick={() => setTab(1)}>b</button>
            {children[tab]}
          </section>
        );
      });
      const App = () => (
        <Tabs>
          <article key="a">
            <p>{'panel-A '.repeat(70)}</p>
          </article>
          <article key="b">
            <p>{'panel-B '.repeat(70)}</p>
          </article>
        </Tabs>
      );
      const {main, html} = await flightAndSsr(<App />);
      expect(html).toContain('panel-A');
      expect(html).not.toContain('panel-B');
      // Panel A is adopted from the HTML; panel B's row was written late.
      expect(main).not.toContain('panel-A');
      expect(main).toContain('panel-B');
      // The articles are children of a Client Component: real, not stubs.
      expect(main).not.toMatch(/\$J[0-9a-f]+:article/);
      const missing = jest.fn();
      const {container, errors} = await hydrate(main, html, {
        onMissingHTML: missing,
      });
      const [tabA, tabB] = container.querySelectorAll('button');
      for (let i = 0; i < 2; i++) {
        await act(() => tabB.click());
        expect(container.querySelector('article').textContent).toBe(
          'panel-B '.repeat(70),
        );
        await act(() => tabA.click());
        expect(container.querySelector('article').textContent).toBe(
          'panel-A '.repeat(70),
        );
      }
      expect(missing).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('swaps unkeyed tab panels without mixing up their content', async () => {
      const Tabs = clientExports(function Tabs({children}) {
        const [tab, setTab] = React.useState(0);
        return (
          <section>
            <button onClick={() => setTab(0)}>a</button>
            <button onClick={() => setTab(1)}>b</button>
            {children[tab]}
          </section>
        );
      });
      const App = () => (
        <Tabs>
          <article>
            <p>{'panel-A '.repeat(70)}</p>
          </article>
          <article>
            <p>{'panel-B '.repeat(70)}</p>
          </article>
        </Tabs>
      );
      const {main, html} = await flightAndSsr(<App />);
      expect(html).toContain('panel-A');
      expect(html).not.toContain('panel-B');
      // Panel A is adopted from the HTML; panel B's row was written late.
      expect(main).not.toContain('panel-A');
      expect(main).toContain('panel-B');
      // The articles are children of a Client Component: real, not stubs.
      expect(main).not.toMatch(/\$J[0-9a-f]+:article/);
      const missing = jest.fn();
      const {container, errors} = await hydrate(main, html, {
        onMissingHTML: missing,
      });
      const [tabA, tabB] = container.querySelectorAll('button');
      for (let i = 0; i < 2; i++) {
        await act(() => tabB.click());
        expect(container.querySelector('article').textContent).toBe(
          'panel-B '.repeat(70),
        );
        await act(() => tabA.click());
        expect(container.querySelector('article').textContent).toBe(
          'panel-A '.repeat(70),
        );
      }
      expect(missing).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('writes no late row for content that SSR rendered', async () => {
      const Counter = clientExports(function Counter() {
        const [n, setN] = React.useState(0);
        return <button onClick={() => setN(n + 1)}>{n}</button>;
      });
      async function Slow() {
        await new Promise(resolve => setTimeout(resolve, 10));
        return <section>{'streamed-content '.repeat(40)}</section>;
      }
      const App = () => (
        <main>
          <article>{'page-content '.repeat(50)}</article>
          <Counter />
          <React.Suspense fallback="loading">
            <Slow />
          </React.Suspense>
        </main>
      );
      const {main, html} = await flightAndSsr(<App />);
      expect(html).toContain('page-content');
      expect(html).toContain('streamed-content');
      expect(main).toContain('$J');
      expect(main).not.toContain('page-content');
      expect(main).not.toContain('streamed-content');
      // No row carries the content: nothing was written late.
      expect(main).not.toContain('static');
      const {container, errors} = await hydrate(main, html);
      expect(container.textContent).toContain('streamed-content');
      expect(errors).toEqual([]);
    });

    it('closes the stream without late rows when the render is aborted', async () => {
      const Panel = createPanel();
      async function Never() {
        await new Promise(() => {});
      }
      const controller = new AbortController();
      const errors = [];
      let main;
      await serverAct(async () => {
        const tee = ReactServerDOMEdgeClient.createTee(createTeeManifest());
        const stream = ReactServerDOMServer.renderToReadableStream(
          <main>
            <Panel>
              <div>
                <p>{'modal-body' + FILL}</p>
              </div>
            </Panel>
            <React.Suspense fallback="loading">
              <Never />
            </React.Suspense>
          </main>,
          webpackMap,
          {
            htmlFirst: new Promise(() => {}),
            tee,
            signal: controller.signal,
            onError(error) {
              errors.push(error.message);
            },
          },
        );
        const browser = readAll(stream);
        // Reads the tee, and never gets to say which rows it rendered.
        await ReactServerDOMEdgeClient.createFromTee(tee);
        controller.abort(new Error('aborted'));
        main = await browser;
      });
      expect(errors).toEqual(['aborted']);
      expect(main).toContain('$J');
      expect(main).not.toContain(':q\n');
      expect(main).not.toContain('modal-body');
    });
  });

  describe('the htmlFirst thenable', () => {
    function createPanel() {
      return clientExports(function Panel({children}) {
        const [open, setOpen] = React.useState(false);
        return (
          <div>
            <button onClick={() => setOpen(!open)}>toggle</button>
            {open ? <aside>{children}</aside> : null}
          </div>
        );
      });
    }

    it('keeps the stream open until the thenable settles', async () => {
      const Panel = createPanel();
      const App = () => (
        <main>
          <article>{'page-content '.repeat(50)}</article>
          <Panel>
            <div>
              <p>{'modal-body' + FILL}</p>
            </div>
          </Panel>
        </main>
      );
      let main;
      let before;
      let endedBefore;
      await serverAct(async () => {
        const t = startTee(<App />);
        const htmlStream = await t.renderHTML();
        await htmlStream.allReady;
        await readAll(htmlStream);
        await macrotasks(5);
        endedBefore = t.ended();
        before = t.text();
        t.settle.resolve();
        main = await t.browser;
        expect(t.ended()).toBe(true);
      });
      // Everything was written and the HTML is done, but the stream is open.
      expect(endedBefore).toBe(false);
      expect(before).toContain('$J');
      expect(before).not.toContain('modal-body');
      // The thenable settling writes the late row, then closes the stream.
      expect(main.startsWith(before)).toBe(true);
      expect(main).toContain('modal-body');
      expect(main.slice(before.length)).toContain('modal-body');
    });

    it('writes a row for every stubbed row when the thenable rejects', async () => {
      const ROWS = 3;
      let main;
      let fulfilled;
      await serverAct(async () => {
        const t = startTee(sharedAppElement(ROWS));
        const htmlStream = await t.renderHTML();
        await htmlStream.allReady;
        const html = await readAll(htmlStream);
        expect(html).toContain('name-2');
        t.settle.reject(new Error('The HTML render failed'));
        main = await t.browser;
      });
      await serverAct(async () => {
        fulfilled = (await renderWithTeeInner(sharedAppElement(ROWS))).main;
      });
      // SSR rendered all of it, and still the payload carries all of it.
      expect(fulfilled).not.toContain('name-2');
      expect(main).toContain('name-0');
      expect(main).toContain('name-2');
      expect(main).toContain('Report');
      const html = (await flight(sharedAppElement(ROWS))).html;
      const {container, errors} = await hydrate(main, html, {
        onMissingHTML() {
          throw new Error('missing');
        },
      });
      expect(errors).toEqual([]);
      expect(container.querySelectorAll('tr').length).toBe(ROWS);
    });

    it('writes no late row for content that SSR rendered while a Client Component suspended', async () => {
      const slow = new Promise(resolve => setTimeout(resolve, 50));
      const Slow = clientExports(function Slow({children}) {
        use(slow);
        return <section>{children}</section>;
      });
      const App = () => (
        <main>
          <p>{'before-text' + FILL}</p>
          <React.Suspense fallback={<i>loading</i>}>
            <Slow>
              <div>
                <p>{'slow-grandchild-text' + FILL}</p>
              </div>
            </Slow>
          </React.Suspense>
        </main>
      );
      const {main, html} = await renderWithTee(<App />);
      expect(html).toContain('slow-grandchild-text');
      expect(html).toContain('before-text');
      expect(main).toMatch(/\$J[0-9a-f]+:p"/);
      expect(main).not.toMatch(/\$J[0-9a-f]+:div/);
      expect(main).not.toContain('slow-grandchild-text');
      expect(main).not.toContain('before-text');
      const missing = jest.fn();
      const {container, errors} = await hydrate(main, html, {
        onMissingHTML: missing,
      });
      expect(container.textContent).toContain('slow-grandchild-text');
      expect(missing).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('stubs nothing when htmlFirst is true', async () => {
      const element = sharedAppElement(5);
      const outputs = [];
      const options = [true, undefined];
      for (let i = 0; i < options.length; i++) {
        const htmlFirst = options[i];
        outputs.push(
          await serverAct(async () =>
            readAll(
              ReactServerDOMServer.renderToReadableStream(element, webpackMap, {
                htmlFirst,
                tee: ReactServerDOMEdgeClient.createTee(createTeeManifest()),
              }),
            ),
          ),
        );
      }
      const withoutTime = text =>
        text.replace(/^[0-9a-f]*:(N|D\{"time").*\n/gm, '');
      expect(withoutTime(outputs[0])).toBe(withoutTime(outputs[1]));
      expect(outputs[0]).not.toContain('$J');
      expect(outputs[0]).not.toContain(':P');
      expect(outputs[0]).toContain('name-4');
    });

    it('serializes what is rendered after the thenable settled in full', async () => {
      let release;
      const gate = new Promise(resolve => {
        release = resolve;
      });
      async function Later() {
        await gate;
        return (
          <section>
            <p>later-text</p>
          </section>
        );
      }
      const App = () => (
        <main>
          <h1>head-text</h1>
          <React.Suspense fallback={<i>loading</i>}>
            <Later />
          </React.Suspense>
        </main>
      );
      let main;
      await serverAct(async () => {
        const t = startTee(<App />);
        await macrotasks(2);
        // The HTML render is done (or failed) before the Server Component is.
        t.settle.resolve();
        await macrotasks(2);
        expect(t.ended()).toBe(false);
        release();
        main = await t.browser;
        expect(t.ended()).toBe(true);
      });
      expect(main).toContain('later-text');
      expect(main).not.toMatch(/\$J[0-9a-f]+:section/);
      // What was stubbed before is written as a late row.
      expect(main).toContain('head-text');
    });

    it('gives the HTML and a late row the same value of a getter', async () => {
      const Panel = createPanel();
      function colorStyle() {
        let reads = 0;
        const style = {};
        Object.defineProperty(style, 'color', {
          enumerable: true,
          get() {
            return reads++ === 0 ? 'red' : 'blue';
          },
        });
        return style;
      }
      const App = () => (
        <main>
          <p style={colorStyle()} data-fill={FILL}>
            rendered-text
          </p>
          <Panel>
            <div>
              <p style={colorStyle()} data-fill={FILL}>
                closed-text
              </p>
            </div>
          </Panel>
        </main>
      );
      const {main, html} = await renderWithTee(<App />);
      expect(html).toContain(
        '<p style="color:red" data-fill="' + FILL + '">rendered-text</p>',
      );
      expect(html).not.toContain('blue');
      expect(html).not.toContain('closed-text');
      // The closed panel's element was not rendered, so its row is late.
      expect(main).not.toContain('rendered-text');
      expect(main).toContain('closed-text');
      expect(main).toContain('red');
      expect(main).not.toContain('blue');
      const {container, errors} = await hydrate(main, html, {
        onMissingHTML() {
          throw new Error('missing');
        },
      });
      await act(() => container.querySelector('button').click());
      expect(errors).toEqual([]);
      expect(container.querySelector('aside p').style.color).toBe('red');
    });

    it('never stubs the children of a template', async () => {
      const App = () => (
        <main>
          <template>
            <p>{'template-text' + FILL}</p>
          </template>
          <p>{'after-text' + FILL}</p>
        </main>
      );
      const {main, html} = await renderWithTee(<App />);
      expect(html).toContain('template-text');
      expect(main).toContain('template-text');
      expect(main).not.toContain('after-text');
      expect(main).not.toMatch(/\$J[0-9a-f]+:template/);
      // Only the element after the template is a stub.
      expect(main.match(/\$J[0-9a-f]+:/g).length).toBe(1);
    });

    it('does not let Server Components render a stub from a payload', async () => {
      const App = () => (
        <main>
          <h1>stub-heading</h1>
          <p data-fill={FILL}>stub-text</p>
        </main>
      );
      const {main} = await renderWithTee(<App />);
      expect(main).toContain('$J');
      const decoded = await consume(main);
      const errors = [];
      await serverAct(async () => {
        await readAll(
          ReactServerDOMServer.renderToReadableStream(decoded, webpackMap, {
            onError(error) {
              errors.push(error.message);
            },
          }),
        );
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain(
        'A stub from an HTML-first payload cannot be rendered by Server Components',
      );
    });
  });

  describe('a Client Component that inspects its children', () => {
    it('keeps the className of an asChild element and adopts the HTML', async () => {
      const onClick = jest.fn(event => event.preventDefault());
      const Slot = clientExports(function Slot({children}) {
        return React.cloneElement(React.Children.only(children), {
          className: 'btn',
          onClick,
        });
      });
      const App = () => (
        <Slot>
          <a href="/x">
            <span>{'Link' + FILL}</span>
          </a>
        </Slot>
      );
      const {main, html} = await renderWithTee(<App />);
      expect(html).toContain('<a href="/x" class="btn">');
      // The <a> is real, so cloneElement saw an element; its child is a stub.
      expect(main).not.toMatch(/\$J[0-9a-f]+:a/);
      expect(main).toMatch(/\$J[0-9a-f]+:span/);
      expect(main).not.toContain('Link');
      const missing = jest.fn();
      const {container, errors} = await hydrate(main, html, {
        onMissingHTML: missing,
      });
      const link = container.querySelector('a');
      expect(link.className).toBe('btn');
      await act(() => link.click());
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(container.querySelector('a')).toBe(link);
      expect(missing).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('keeps the <li> children it filters by type', async () => {
      const OnlyItems = clientExports(function OnlyItems({children}) {
        return (
          <ul>
            {React.Children.toArray(children).filter(
              child => child.type === 'li',
            )}
          </ul>
        );
      });
      const App = () => (
        <OnlyItems>
          <li>
            <b>one</b>
          </li>
          <p>skipped</p>
          <li>
            <b>two</b>
          </li>
        </OnlyItems>
      );
      const {main, html} = await renderWithTee(<App />);
      expect(html).toBe('<ul><li><b>one</b></li><li><b>two</b></li></ul>');
      expect(main).not.toMatch(/\$J[0-9a-f]+:li/);
      const {container, errors} = await hydrate(main, html);
      expect(errors).toEqual([]);
      expect(container.innerHTML).toBe(html);
    });
  });

  it('names the missing element when late-mounted content has no recovery callback', async () => {
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
        <div>
          <section>{'modal-body' + FILL}</section>
        </div>
      </Panel>
    );
    const f = await flightWithoutLateRows(<App />);
    const html = await ssr(f);
    const {container} = await hydrate(f.main, html);
    await act(() => container.querySelector('button').click());
    await act(async () => {});
    expect(reportedErrors).toHaveLength(1);
    expect(reportedErrors[0]).toContain('a <section>');
    expect(reportedErrors[0]).toContain('mounts after hydration');
    expect(reportedErrors[0]).toContain('onMissingHTML');
    reportedErrors.length = 0;
    expect(container.textContent).not.toContain('modal-body');
  });

  it('keeps the key on the stub of a stubbed element', async () => {
    const Client = clientExports(function Client() {
      return <i>c</i>;
    });
    function Item({label}) {
      return <li>{label + FILL}</li>;
    }
    const App = () => (
      <ul>
        <Client />
        {['a', 'b'].map(l => (
          <li key={l}>{'item-' + l + FILL}</li>
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

  it('does not stub a Suspense fallback that is shown after hydration', async () => {
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
    expect(f.main).not.toContain('$J');
    const html = await ssr(f);
    const {container, errors} = await hydrate(f.main, html);
    await act(() => container.querySelector('button').click());
    expect(errors).toEqual([]);
    expect(container.textContent).toContain('loading...');
  });

  it('stubs client-only-wrapper children and recovers after mount', async () => {
    const ClientOnly = clientExports(function ClientOnly({children}) {
      const [mounted, setMounted] = React.useState(false);
      React.useEffect(() => setMounted(true), []);
      return mounted ? children : null;
    });
    const App = () => (
      <div>
        <ClientOnly>
          <section>
            <p>{'client-only-content' + FILL}</p>
          </section>
        </ClientOnly>
      </div>
    );
    const f = await flightWithoutLateRows(<App />);
    expect(f.main).toMatch(/\$J[0-9a-f]+:p"/);
    expect(f.main).not.toMatch(/\$J[0-9a-f]+:section/);
    expect(f.main).not.toContain('client-only-content');
    const html = await ssr(f);
    const missing = jest.fn();
    const {container, errors, root} = await hydrate(f.main, html, {
      onMissingHTML: () => {
        missing();
      },
    });
    // useEffect opens the children; stubs recover.
    expect(missing).toHaveBeenCalled();
    await renderFullPayload(root, <App />);
    expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
    expect(container.textContent).toContain('client-only-content');
  });

  it('stubs host-position static hosts, and inside client children, not other props', async () => {
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
              <td>{'server-row-text' + FILL}</td>
            </tr>
          </tbody>
        </table>
      );
    }
    const App = () => (
      <main>
        <Client fallback={<i>client-prop-text</i>}>
          <div>
            <p>{'client-child-text' + FILL}</p>
          </div>
          <ServerTable />
        </Client>
        <section>
          <Client />
          <h2>{'host-child-text' + FILL}</h2>
        </section>
        <React.Suspense fallback={<p>suspense-fallback-text</p>}>
          <ServerTable />
          <h3>{'suspense-content-text' + FILL}</h3>
        </React.Suspense>
        <ServerTable />
      </main>
    );
    const f = await flight(<App />);
    // Stubbed: server output, host children, Suspense children, and what is
    // inside the children of a client component. They are in the HTML.
    [
      'server-row-text',
      'host-child-text',
      'suspense-content-text',
      'client-child-text',
    ].forEach(text => {
      expect(f.html).toContain(text);
      expect(f.main).not.toContain(text);
    });
    // Kept: non-children client props, and Suspense fallbacks.
    ['client-prop-text', 'suspense-fallback-text'].forEach(kept => {
      expect(f.main).toContain(kept);
    });
    expect(f.main).toMatch(/\$J[0-9a-f]+:table/);
    // The children of the client component are real: the div, and the
    // table of the Server Component. What is in them is stubbed.
    expect(f.main).not.toMatch(/\$J[0-9a-f]+:div/);
    expect(f.main).toMatch(/\$J[0-9a-f]+:p"/);
    expect(f.main).toMatch(/\$J[0-9a-f]+:tbody"/);
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
      // Only the server's walk matters, so no HTML is rendered: the render is
      // aborted, which closes the stream without late rows.
      const controller = new AbortController();
      await serverAct(async () => {
        const stream = ReactServerDOMServer.renderToReadableStream(
          node,
          webpackMap,
          {
            htmlFirst: new Promise(() => {}),
            tee: ReactServerDOMEdgeClient.createTee(createTeeManifest()),
            signal: controller.signal,
            onError() {},
          },
        );
        const browser = readAll(stream);
        await new Promise(resolve => setTimeout(resolve, 10));
        controller.abort(new Error('aborted'));
        await browser;
      });
      return reads;
    }
    const shallow = await countTypeReads(20);
    const deep = await countTypeReads(80);
    // 4x deeper: ~4x the reads (linear), not ~16x (quadratic).
    expect(deep / shallow).toBeLessThan(6);
  });

  it('keeps everything from stubbed rows out of the main stream', async () => {
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
    expect(f.html).toContain(T);
    expect(f.main).not.toContain(T);
    expect(f.main).not.toContain('big-text-');
  });

  describe('inside Suspense boundaries', () => {
    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Streams the HTML of `app` like a server does, reading the Flight
    // render through a tee. Boundaries complete as the Flight rows arrive, so
    // the HTML comes in chunks: the shell, then one per completed boundary.
    // Like a framework, it rejects the htmlFirst thenable when Fizz reported
    // an error. Returns the browser payload and the HTML chunks.
    function streamHTML(app, fizzOptions) {
      return serverAct(async () => {
        let failed = false;
        const t = startTee(app);
        const htmlStream = await t.renderHTML({
          ...fizzOptions,
          onError(error) {
            failed = true;
            if (fizzOptions && fizzOptions.onError) {
              fizzOptions.onError(error);
            }
          },
        });
        const chunks = [];
        const reader = htmlStream.getReader();
        const reading = (async () => {
          // Fizz splits long text between writes. A chunk ends at a tag, so
          // that each one parses on its own.
          let pending = '';
          while (true) {
            const {done, value} = await reader.read();
            if (done) {
              if (pending !== '') {
                chunks.push(pending);
              }
              return;
            }
            pending += decoder.decode(value);
            if (pending.endsWith('>')) {
              chunks.push(pending);
              pending = '';
            }
          }
        })();
        await htmlStream.allReady;
        if (failed) {
          t.settle.reject(new Error('The HTML render failed'));
        } else {
          t.settle.resolve();
        }
        await reading;
        return {main: await t.browser, chunks};
      });
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
    async function hydrateStream(main, chunks, ready, onMissingHTML) {
      const container = document.createElement('div');
      document.body.appendChild(container);
      for (let i = 0; i < ready; i++) {
        await insertHTML(container, chunks[i]);
      }
      const errors = [];
      const response = ReactServerDOMClient.createFromReadableStream(
        stringToStream(main),
        {onMissingHTML},
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
            <p>{label + '-text' + FILL}</p>
            {children}
          </section>
        );
      }
      return function App() {
        return (
          <main>
            <h1>{'shell-text' + FILL}</h1>
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

    it('stubs and adopts late server components in nested boundaries completed out of order', async () => {
      const App = makeStreamingApp();
      // The Flight server resolves the side, then the outer, then the inner
      // boundary, and Fizz completes them in that order. Boundaries that
      // complete together share a chunk.
      const {main, chunks} = await streamHTML(<App />);
      ['shell-text', 'outer-text', 'inner-text', 'side-text'].forEach(text =>
        expect(main).not.toContain(text),
      );
      expect(chunks[0]).toContain('loading-outer');
      expect(chunks[0]).not.toContain('side-text');
      const all = chunks.join('');
      expect(all.indexOf('side-text')).toBeGreaterThan(0);
      expect(all.indexOf('outer-text')).toBeGreaterThan(
        all.indexOf('side-text'),
      );
      expect(all.indexOf('inner-text')).toBeGreaterThan(
        all.indexOf('outer-text'),
      );

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
        'shell-text' +
          FILL +
          'n:0outer-text' +
          FILL +
          'inner-text' +
          FILL +
          'side-text' +
          FILL,
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
      const {main, chunks} = await streamHTML(<App />);
      expect(main).toContain('$J');
      expect(chunks.length).toBeGreaterThan(1);
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
        'shell-text' +
          FILL +
          'n:2outer-text' +
          FILL +
          'inner-text' +
          FILL +
          'side-text' +
          FILL,
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
        return <article>{'static-sibling '.repeat(40)}</article>;
      }
      const content = (
        <>
          <Article />
          <p>{'static-p' + FILL}</p>
          <Fragile />
        </>
      );
      function App() {
        return (
          <main>
            <h1>{'shell-text' + FILL}</h1>
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

    async function expectRecovery(withSuspense) {
      const {App, goToClient} = makeFragileApp(false, withSuspense);
      const {main, chunks} = await streamHTML(<App />, {onError() {}});
      expect(main).not.toContain('static-sibling');
      expect(main).not.toContain('static-p');
      goToClient();
      const missing = jest.fn();
      // Without the markers there is nothing to rebuild the content from.
      const {container, errors, root} = await hydrateStream(
        main,
        chunks.map(withoutMarkers),
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
        'shell-text' +
          FILL +
          'static-sibling '.repeat(40) +
          'static-p' +
          FILL +
          'client-ok',
      );
      // The full payload has real elements where the stubs were. Where a stub
      // adopted DOM (outside of the boundary) it is what they would render, so
      // it stays. A root that client-renders has no such DOM.
      expect(container.querySelector('h1') === h1).toBe(withSuspense);
      expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
      expect(missing).toHaveBeenCalledTimes(1);
      return {chunks, errors};
    }

    it('writes every row when the HTML render failed, so a boundary that client-renders after a server error shows its static siblings', async () => {
      const {App, goToClient} = makeFragileApp(true, true);
      const serverErrors = [];
      const {main, chunks} = await streamHTML(<App />, {
        onError(error) {
          serverErrors.push(error.message);
        },
      });
      expect(main).toContain('$J');
      expect(serverErrors).toEqual(['window is not defined']);
      expect(chunks.join('')).toContain('loading');
      expect(chunks.join('')).not.toContain('static-sibling');
      // Fizz failed, so the framework rejected: every stubbed row is in the
      // payload, including the shell's, which SSR did render.
      expect(main).toContain('static-sibling');
      expect(main).toContain('static-p');
      expect(main).toContain('shell-text');
      goToClient();
      const missing = jest.fn();
      const {container, errors} = await hydrateStream(
        main,
        chunks,
        chunks.length,
        missing,
      );
      // (The container also has the server's error text after <main>.)
      expect(container.querySelector('main').textContent).toBe(
        'shell-text' +
          FILL +
          'static-sibling '.repeat(40) +
          'static-p' +
          FILL +
          'client-ok',
      );
      expect(missing).not.toHaveBeenCalled();
      expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
      expect(reportedErrors).toEqual([]);
    });

    it('recovers a boundary that client-renders after a hydration mismatch', async () => {
      const {errors} = await expectRecovery(true);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('recoverable');
    });

    it('recovers a root that client-renders after a hydration mismatch', async () => {
      const {errors} = await expectRecovery(false);
      // The mismatch, and the full payload rendered before the root committed.
      expect(errors.length).toBe(2);
      errors.forEach(e => expect(e).toContain('recoverable'));
    });

    it('reports an error and keeps the page when onMissingHTML is not provided', async () => {
      for (let i = 0; i < 2; i++) {
        const withSuspense = i === 0;
        const {App, goToClient} = makeFragileApp(false, withSuspense);
        const {main, chunks} = await streamHTML(<App />, {onError() {}});
        goToClient();
        const {container, errors} = await hydrateStream(
          main,
          chunks.map(withoutMarkers),
          chunks.length,
          undefined,
        );
        expect(reportedErrors.length).toBe(1);
        expect(reportedErrors.pop()).toContain('onMissingHTML');
        expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
        // Not blank: the shell and the boundary fallback (or the server HTML
        // of the root) stay on screen.
        expect(visibleText(container)).toContain('shell-text');
        expect(visibleText(container)).toContain(
          withSuspense ? 'loading' : 'static-p',
        );
      }
    });

    describe('server DOM that React discards before a stub adopts it', () => {
      [true, false].forEach(provide =>
        it(
          'rebuilds a boundary that client-renders after a context update, with onMissingHTML ' +
            (provide ? 'provided' : 'not provided'),
          async () => {
            let onServer = true;
            let setValue;
            let openGate;
            const gate = new Promise(resolve => (openGate = resolve));
            const Ctx = React.createContext(0);
            const Provider = clientExports(function Provider({children}) {
              const [value, setter] = React.useState(0);
              setValue = setter;
              return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
            });
            const Reader = clientExports(function Reader() {
              const value = React.useContext(Ctx);
              if (!onServer) {
                use(gate);
              }
              return <b>v:{value}</b>;
            });
            const App = () => (
              <Provider>
                <React.Suspense fallback={<i>loading</i>}>
                  <p>{'static-a' + FILL}</p>
                  <Reader />
                  <p>{'static-b' + FILL}</p>
                </React.Suspense>
              </Provider>
            );
            const {main, html} = await renderWithTee(<App />);
            expect(main).not.toContain('static-a');
            expect(html).toContain('static-a');
            onServer = false;
            // The client renders with its own copy of the context.
            Ctx._currentRenderer = null;
            Ctx._currentRenderer2 = null;
            const missing = jest.fn();
            const {container, errors} = await hydrate(
              main,
              html,
              provide ? {onMissingHTML: missing} : undefined,
            );
            // The context changes before the dehydrated boundary hydrates, so
            // React client-renders it and the stubs render while the server
            // DOM is still in the document.
            await act(() => setValue(1));
            await act(async () => {
              openGate();
            });
            expect(missing).not.toHaveBeenCalled();
            expect(visibleText(container)).toBe(
              'static-a' + FILL + 'v:1static-b' + FILL,
            );
            expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual(
              [],
            );
          },
        ),
      );

      it('rebuilds stubs that show again after React removed their dehydrated boundary', async () => {
        let snapshot = false;
        const listeners = new Set();
        const subscribe = listener => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        };
        const Gate = clientExports(function Gate({children}) {
          const show = React.useSyncExternalStore(
            subscribe,
            () => snapshot,
            () => true,
          );
          return show ? children : null;
        });
        const App = () => (
          <Gate>
            <React.Suspense fallback={<i>loading</i>}>
              <section>
                <p>{'static-text' + FILL}</p>
              </section>
            </React.Suspense>
          </Gate>
        );
        const {main, html} = await renderWithTee(<App />);
        expect(html).toContain('static-text');
        const missing = jest.fn();
        const {container, errors} = await hydrate(main, html, {
          onMissingHTML: missing,
        });
        // The client's snapshot hides the children, and React removes the
        // dehydrated boundary.
        expect(container.textContent).toBe('');
        snapshot = true;
        await act(() => listeners.forEach(listener => listener()));
        expect(missing).not.toHaveBeenCalled();
        expect(container.innerHTML).toBe(
          '<section><p>static-text' + FILL + '</p></section>',
        );
        expect(errors.filter(e => !e.startsWith('recoverable'))).toEqual([]);
      });
    });

    describe('markers', () => {
      const markers = html => html.match(/<!--J[0-9a-f]+:[0-9a-f]+-->/g) || [];

      it('are written only for stubs React can discard before it adopts them', async () => {
        const Counter = clientExports(function Counter() {
          return <button>count</button>;
        });
        // A Client Component that shows its children in an Activity boundary.
        const Show = clientExports(function Show({children}) {
          return <React.Activity mode="visible">{children}</React.Activity>;
        });
        const App = () => (
          <main>
            <Counter />
            <p>{'outside' + FILL}</p>
            <React.Suspense fallback={<i>loading</i>}>
              <p>{'in-suspense' + FILL}</p>
            </React.Suspense>
            <Show>
              <div>
                <p>{'in-activity' + FILL}</p>
              </div>
            </Show>
          </main>
        );
        const {main, html} = await renderWithTee(<App />);
        expect(main.match(/\$J[0-9a-f]+:/g).length).toBe(3);
        const found = markers(html);
        expect(found.length).toBe(2);
        const after = marker =>
          html.slice(html.indexOf(marker) + marker.length);
        expect(after(found[0]).startsWith('<p>in-suspense')).toBe(true);
        expect(after(found[1]).startsWith('<p>in-activity')).toBe(true);
        expect(html).toContain('<p>outside');
        expect(html).not.toMatch(/<!--J[0-9a-f]+:[0-9a-f]+--><p>outside/);
      });
    });

    describe('nesting that the HTML parser rewrites', () => {
      beforeEach(() => {
        // React warns about invalid nesting in development.
        jest.spyOn(console, 'error').mockImplementation(() => {});
      });

      const cases = {
        'a block in a paragraph': () => (
          <section>
            <p>
              <div>{'block' + FILL}</div>
            </p>
          </section>
        ),
        'a block deep in a paragraph': () => (
          <section>
            <p>
              <span>
                <ul>
                  <li>{'item' + FILL}</li>
                </ul>
              </span>
            </p>
          </section>
        ),
        'a heading in a heading': () => (
          <section>
            <h2>
              <h3>{'heading' + FILL}</h3>
            </h2>
          </section>
        ),
        'a link in a link': () => (
          <section>
            <a href="/1">
              {'outer' + FILL}
              <a href="/2">inner</a>
            </a>
          </section>
        ),
        'a row in a table': () => (
          <section>
            <table>
              <tr>
                <td>{'cell' + FILL}</td>
              </tr>
            </table>
          </section>
        ),
        'a cell in a body': () => (
          <section>
            <table>
              <tbody>
                <td>{'cell' + FILL}</td>
              </tbody>
            </table>
          </section>
        ),
        'text in a table': () => (
          <section>
            <table>
              <tbody>
                <tr>
                  {'text' + FILL}
                  <td>cell</td>
                </tr>
              </tbody>
            </table>
          </section>
        ),
        'a row outside a table': () => (
          <section>
            <div>
              <tr>
                <td>{'cell' + FILL}</td>
              </tr>
            </div>
          </section>
        ),
      };

      Object.keys(cases).forEach(name =>
        it(
          'keeps ' + name + ' in the payload, as without the option',
          async () => {
            const App = cases[name];
            const on = await renderWithTee(<App />);
            const off = await renderWithTee(<App />, {htmlFirst: false});
            expect(on.main).not.toContain('$J');
            expect(on.html).toBe(off.html);
            const missing = jest.fn();
            const hydratedOn = await hydrate(on.main, on.html, {
              onMissingHTML: missing,
            });
            const hydratedOff = await hydrate(off.main, off.html);
            expect(missing).not.toHaveBeenCalled();
            expect(hydratedOn.errors).toEqual(hydratedOff.errors);
            expect(hydratedOn.container.innerHTML).toBe(
              hydratedOff.container.innerHTML,
            );
          },
        ),
      );

      it('still stubs valid nesting', async () => {
        const App = () => (
          <section>
            <p>
              <a href="/1">{'link' + FILL}</a>
            </p>
            <table>
              <caption>caption</caption>
              <thead>
                <tr>
                  <th>head</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <p>{'cell' + FILL}</p>
                    <a href="/2">second</a>
                  </td>
                </tr>
              </tbody>
            </table>
            <h2>
              <span>{'heading' + FILL}</span>
            </h2>
          </section>
        );
        const {main, html} = await renderWithTee(<App />);
        expect(main).toContain('$J');
        expect(main).not.toContain('cell');
        const {errors} = await hydrate(main, html);
        expect(errors).toEqual([]);
      });
    });

    describe('prerender and resume', () => {
      const hang = new Promise(() => {});
      let dynamicDone;

      // A server component that is the hole of the prerender: it never
      // finishes there, and in the resume it is done.
      async function Dynamic() {
        await dynamicDone;
        return <p>dynamic-text</p>;
      }

      function makeApp(shape) {
        const Counter = clientExports(function Counter() {
          const [n, setN] = React.useState(0);
          return <button onClick={() => setN(n + 1)}>n:{n}</button>;
        });
        const table = (
          <table>
            <tbody>
              <tr>
                <td>{'static-table' + FILL}</td>
              </tr>
            </tbody>
          </table>
        );
        const dynamic = (
          <React.Suspense fallback={<i>loading-dynamic</i>}>
            <Dynamic />
          </React.Suspense>
        );
        return function App() {
          // On the path the resume replays, <main> holds the hole. The
          // section holds a client component and no hole, so it is off it.
          return shape === 'on-path' ? (
            <main>
              <Counter />
              {table}
              {dynamic}
            </main>
          ) : (
            <main>
              <section>
                <Counter />
                {table}
              </section>
              {dynamic}
            </main>
          );
        };
      }

      // The prerender halts at the hole, then a second Flight render (the
      // one whose bytes the browser gets) is read by Fizz's resume.
      async function prerenderAndResume(shape) {
        const App = makeApp(shape);
        const flightController = new AbortController();
        const prerenderController = new AbortController();
        dynamicDone = hang;
        const prerendered = await serverAct(async () => {
          const t = startTee(<App />, {
            signal: flightController.signal,
            onError() {},
          });
          const pending = ReactDOMFizzStatic.prerender(t.element, {
            signal: prerenderController.signal,
            onError() {},
          });
          await macrotasks(1);
          prerenderController.abort();
          const result = await pending;
          flightController.abort();
          await t.browser;
          return result;
        });
        expect(prerendered.postponed).not.toBe(null);
        const prelude = await readAll(prerendered.prelude);

        dynamicDone = Promise.resolve();
        return serverAct(async () => {
          const t = startTee(<App />);
          const resumed = await ReactDOMFizzServer.resume(
            t.element,
            JSON.parse(JSON.stringify(prerendered.postponed)),
            {onError() {}},
          );
          const resumeChunks = [];
          const reader = resumed.getReader();
          const reading = (async () => {
            while (true) {
              const {done, value} = await reader.read();
              if (done) {
                return;
              }
              resumeChunks.push(decoder.decode(value));
            }
          })();
          await resumed.allReady;
          t.settle.resolve();
          await reading;
          return {main: await t.browser, chunks: [prelude, ...resumeChunks]};
        });
      }

      ['off-path', 'on-path'].forEach(shape => {
        it(
          'leaves static content in the prelude out of the payload (' +
            shape +
            ')',
          async () => {
            const {main, chunks} = await prerenderAndResume(shape);
            expect(chunks.join('')).toContain('static-table');
            // Neither inline nor as a late row.
            expect(main).not.toContain('static-table');
            const onMissingHTML = jest.fn();
            const {container, errors} = await hydrateStream(
              main,
              chunks,
              chunks.length,
              onMissingHTML,
            );
            expect(onMissingHTML).not.toHaveBeenCalled();
            expect(errors).toEqual([]);
            expect(visibleText(container)).toContain('static-table');
            expect(visibleText(container)).toContain('dynamic-text');
          },
        );
      });
    });
  });
});
