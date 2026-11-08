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
  patchMessageChannel,
} = require('../../../../scripts/jest/patchMessageChannel');

let clientExports;
let webpackMap;
let act;
let serverAct;
let React;
let ReactServer;
let ReactDOMClient;
let ReactDOMFizzServer;
let ReactServerDOMServer;
let ReactServerDOMClient;
let use;

describe('ReactFlightDOMBrowser html-first elision', () => {
  beforeEach(() => {
    jest.resetModules();

    const ReactServerScheduler = require('scheduler');
    patchMessageChannel(ReactServerScheduler);
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    ReactServer = require('react');
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
  const CSS = '.a{color:red}\n'.repeat(500); // ~7KB
  const JSON_LD = JSON.stringify({
    '@context': 'https://schema.org',
    items: Array.from({length: 200}, (_, i) => ({name: 'item-' + i})),
  });
  const BIG = 'big-text-'.repeat(300);

  async function flight(element, elide) {
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

  function makeApp() {
    const Counter = clientExports(function Counter({label}) {
      const [n, setN] = React.useState(0);
      return (
        <button onClick={() => setN(n + 1)}>
          {label}:{n}
        </button>
      );
    });
    return function App() {
      return (
        <div id="root">
          <style dangerouslySetInnerHTML={{__html: CSS}} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{__html: JSON_LD}}
          />
          <div id="big" dangerouslySetInnerHTML={{__html: BIG}} />
          <Counter label="clicks" />
        </div>
      );
    };
  }

  it('keeps style, JSON-LD and big strings out of the inlined stream', async () => {
    const App = makeApp();
    const baseline = await flight(<App />, false);
    const elided = await flight(<App />, true);
    expect(baseline.main).toContain('item-199');
    expect(baseline.main).toContain('.a{color:red}');
    expect(elided.main).not.toContain('item-199');
    expect(elided.main).not.toContain('.a{color:red}');
    expect(elided.main).not.toContain('big-text-');
    // No text rows (2:T...) leaked into the main stream either.
    expect(elided.main).not.toMatch(/^[0-9a-f]+:T/m);
    expect(elided.main).toContain('"clicks"');
    expect(byteLength(elided.main)).toBeLessThan(2000);
    // The withheld rows carry the content for SSR.
    const rows = Array.from(elided.rows.values()).join('');
    expect(rows).toContain('item-199');
    expect(rows).toContain('big-text-');
  });

  it('does not elide resources or executable scripts', async () => {
    const {main, rows} = await flight(
      <div>
        <script>{'window.__x=1'}</script>
        <script type="application/ld+json" src="/x.json" />
        <style precedence="default" href="s">
          {'.zz{color:blue}'}
        </style>
      </div>,
      true,
    );
    expect(rows.size).toBe(0);
    expect(main).toContain('window.__x=1');
    expect(main).toContain('.zz{color:blue}');
  });

  it('hydrates SSR HTML with the stripped stream without mismatches', async () => {
    const App = makeApp();
    const elided = await flight(<App />, true);
    const html = await ssr(elided);
    expect(html).toContain('item-199');
    expect(html).toContain('.a{color:red}');
    expect(html).toContain('big-text-');

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const style = container.querySelector('style');
    const script = container.querySelector('script');
    const big = container.querySelector('#big');
    const button = container.querySelector('button');

    // The browser only gets the stripped stream (no side channel).
    const response = consume(elided.main);
    await response;
    let root;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(
        container,
        <Shell response={response} />,
      );
    });
    // console.error is asserted empty by the test setup: no mismatch warnings.
    expect(container.querySelector('style')).toBe(style);
    expect(container.querySelector('script')).toBe(script);
    expect(container.querySelector('#big')).toBe(big);
    expect(container.querySelector('button')).toBe(button);
    expect(container.querySelectorAll('script').length).toBe(1);
    expect(script.textContent).toBe(JSON_LD);
    expect(style.textContent).toBe(CSS);
    expect(container.innerHTML).toBe(html);

    await act(() => {
      button.click();
    });
    expect(button.textContent).toBe('clicks:1');

    // Navigation: a full (non elided) payload has the real new content.
    const NextApp = () => (
      <div id="root">
        <style dangerouslySetInnerHTML={{__html: '.next{color:green}'}} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: '{"next":true}'}}
        />
      </div>
    );
    const next = await flight(<NextApp />, false);
    expect(next.main).toContain('.next{color:green}');
    const nextResponse = consume(next.main);
    await nextResponse;
    await act(() => {
      root.render(<Shell response={nextResponse} />);
    });
    expect(container.querySelector('style').textContent).toBe(
      '.next{color:green}',
    );
    expect(container.querySelector('script').textContent).toBe('{"next":true}');
    expect(container.querySelector('#big')).toBe(null);
  });

  it('hydrates a whole document (head style/JSON-LD) with an async Suspense boundary', async () => {
    const Counter = clientExports(function Counter({label}) {
      const [n, setN] = React.useState(0);
      return (
        <button onClick={() => setN(n + 1)}>
          {label}:{n}
        </button>
      );
    });
    async function Late() {
      await new Promise(resolve => setTimeout(resolve, 10));
      return (
        <section id="late">
          <style dangerouslySetInnerHTML={{__html: '.late{color:red}'}} />
          <p>{'late-text '.repeat(200)}</p>
          <Counter label="late" />
        </section>
      );
    }
    function Doc() {
      return (
        <html>
          <head>
            <title>t</title>
            <style dangerouslySetInnerHTML={{__html: CSS}} />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{__html: JSON_LD}}
            />
          </head>
          <body>
            <h1>Static</h1>
            <React.Suspense fallback={<p>loading</p>}>
              <Late />
            </React.Suspense>
          </body>
        </html>
      );
    }
    const elided = await flight(<Doc />, true);
    expect(elided.main).not.toContain('item-199');
    expect(elided.main).not.toContain('late-text');
    expect(elided.rows.size).toBeGreaterThan(0);

    const html = await ssr(elided);
    expect(html).toContain('item-199');
    expect(html).toContain('late-text');
    document.open();
    document.write(html);
    document.close();
    const style = document.head.querySelector('style');
    const script = document.head.querySelector('script[type]');
    const late = document.getElementById('late');
    const button = document.querySelector('button');

    const response = consume(elided.main);
    await response;
    await act(() => {
      ReactDOMClient.hydrateRoot(document, <Shell response={response} />);
    });
    expect(document.head.querySelector('style')).toBe(style);
    expect(document.head.querySelector('script[type]')).toBe(script);
    expect(document.getElementById('late')).toBe(late);
    expect(document.querySelector('button')).toBe(button);
    await act(() => {
      button.click();
    });
    expect(button.textContent).toBe('late:1');
  });

  it('prunes props the browser does not need, SSR still sees them', async () => {
    const prune = ReactServerDOMServer.unstable_pruneForBrowser;
    const Row = clientExports(function Row({name, details}) {
      // SSR renders the details; the browser never gets them and must not
      // need them to hydrate (it only reads `name`).
      return (
        <li>
          {name}
          <i hidden={details !== undefined} />
        </li>
      );
    });
    const details = {notes: 'secret-notes-'.repeat(100)};
    const App = () => <Row name="a" details={prune(details)} />;
    const elided = await flight(<App />, true);
    const full = await flight(<App />, false);
    expect(full.main).toContain('secret-notes-');
    expect(elided.main).not.toContain('secret-notes-');
    expect(elided.main).toContain('$J');
    expect(Array.from(elided.rows.values()).join('')).toContain(
      'secret-notes-',
    );
    // SSR consumer got the real value.
    const response = consume(elided.main, elided.rows);
    const row = await response;
    expect(row.props.details).toEqual(details);
    // Browser consumer gets undefined.
    const browser = await consume(elided.main);
    expect(browser.props.details).toBe(undefined);
    expect(browser.props.name).toBe('a');
  });

  it('elides a stateless client element: browser adopts the DOM', async () => {
    const prune = ReactServerDOMServer.unstable_pruneForBrowser;
    const Item = clientExports(function Item({label}) {
      return <li className="item">{label}</li>;
    });
    const App = () => (
      <ul>
        {['a', 'b', 'c'].map(l => prune(<Item key={l} label={l} />, 'li'))}
      </ul>
    );
    const elided = await flight(<App />, true);
    expect(elided.main).not.toContain('"label"');
    expect(elided.rows.size).toBe(1);
    const html = await ssr(elided);
    expect(html).toBe(
      '<ul><li class="item">a</li><li class="item">b</li><li class="item">c</li></ul>',
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const lis = Array.from(container.querySelectorAll('li'));
    const response = consume(elided.main);
    await response;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <Shell response={response} />);
    });
    expect(Array.from(container.querySelectorAll('li'))).toEqual(lis);
    expect(container.innerHTML).toBe(html);
  });

  it('hands off interactive client components inside static regions to hydration', async () => {
    const prune = ReactServerDOMServer.unstable_pruneForBrowser;
    const Item = clientExports(function Item({label}) {
      return <li className="item">{label}</li>;
    });
    const Counter = clientExports(function Counter({label}) {
      const [n, setN] = React.useState(0);
      return (
        <li>
          <button onClick={() => setN(n + 1)}>
            {label}:{n}
          </button>
        </li>
      );
    });
    const Static = () => (
      <ul>
        {['a', 'b', 'c'].map(l => prune(<Item key={l} label={l} />, 'li'))}
      </ul>
    );
    const Mixed = () => (
      <ul>
        {prune(<Item key="a" label="a" />, 'li')}
        <Counter key="c" label="clicks" />
        {prune(<Item key="b" label="b" />, 'li')}
      </ul>
    );

    // All static: the whole <ul> collapses into one stub.
    const allStatic = await flight(<Static />, true);
    expect(allStatic.main).toContain('$J');
    expect(allStatic.main).not.toContain('"ul"');
    expect(allStatic.rows.size).toBe(1);

    // One interactive child: skeleton stays, Counter keeps its props.
    const mixed = await flight(<Mixed />, true);
    expect(mixed.main).toContain('"ul"');
    expect(mixed.main).toContain('"clicks"');
    expect(mixed.main).not.toContain('"a"');
    expect(mixed.rows.size).toBe(2);

    const html = await ssr(mixed);
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const ul = container.querySelector('ul');
    const lis = Array.from(container.querySelectorAll('li'));
    const button = container.querySelector('button');
    const response = consume(mixed.main);
    await response;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <Shell response={response} />);
    });
    expect(container.querySelector('ul')).toBe(ul);
    expect(Array.from(container.querySelectorAll('li'))).toEqual(lis);
    expect(container.querySelector('button')).toBe(button);
    expect(container.innerHTML).toBe(html);
    await act(() => {
      button.click();
    });
    expect(button.textContent).toBe('clicks:1');
  });

  it('hands SSR live rows (no JSON) and renders identical HTML', async () => {
    const prune = ReactServerDOMServer.unstable_pruneForBrowser;
    const Item = clientExports(function Item({label}) {
      return <li className="item">{label}</li>;
    });
    // What SSR renders for the client reference in a live row.
    function RealItem({label}) {
      return <li className="item">{label}</li>;
    }
    const Counter = clientExports(function Counter({label}) {
      const [n, setN] = React.useState(0);
      return (
        <li>
          <button onClick={() => setN(n + 1)}>
            {label}:{n}
          </button>
        </li>
      );
    });
    const App = () => (
      <section>
        <h1>{'static '.repeat(300)}</h1>
        <ul>
          {prune(<Item key="a" label="a" />, 'li')}
          <Counter key="c" label="clicks" />
          {prune(<Item key="b" label="b" />, 'li')}
        </ul>
      </section>
    );
    const json = await flight(<App />, true);

    const live = new Map();
    const main = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(<App />, webpackMap, {
          onElidedValue: (id, value) => live.set(id, value),
        }),
      ),
    );
    // The rows are live values, never strings. The module row of the stubbed
    // component stays out of the stream, so the browser doesn't preload it.
    const moduleRows = text => (text.match(/^[0-9a-f]+:I\[/gm) || []).length;
    expect(moduleRows(json.main)).toBe(2);
    expect(moduleRows(main)).toBe(1);
    expect(live.size).toBe(json.rows.size);
    Array.from(live.values()).forEach(v => expect(typeof v).toBe('object'));
    expect(main).not.toContain('static static');

    // The framework resolves client references in the live nodes (it has the
    // manifest) and hands them to the SSR client.
    function resolve(node) {
      if (Array.isArray(node)) {
        return node.map(resolve);
      }
      if (node && node.$$typeof === Symbol.for('react.pruned')) {
        return resolve(node.value);
      }
      if (node && node.$$typeof === Symbol.for('react.transitional.element')) {
        const type = node.type === Item ? RealItem : node.type;
        return React.createElement(type, {
          key: node.key,
          ...node.props,
          children: resolve(node.props.children),
        });
      }
      return node;
    }
    const resolved = new Map(Array.from(live, ([id, v]) => [id, resolve(v)]));
    expect(await ssr({main, rows: resolved})).toBe(await ssr(json));
  });

  // @gate enableTaint
  it('applies taint checks to live rows like it does to JSON rows', async () => {
    const secret = 'very-secret-token-' + 'x'.repeat(40);
    const run = async (element, live) => {
      const rows = new Map();
      const errors = [];
      const options = {
        onError: e => {
          errors.push(e.message);
        },
        ...(live
          ? {onElidedValue: (id, v) => rows.set(id, v)}
          : {onElidedRow: (id, json) => rows.set(id, json)}),
      };
      const main = await serverAct(async () =>
        readAll(
          ReactServerDOMServer.renderToReadableStream(
            element,
            webpackMap,
            options,
          ),
        ),
      );
      return {main, rows, errors};
    };
    // The taint lives as long as this object does; keep it referenced.
    const lifetime = {};
    ReactServer.experimental_taintUniqueValue('no secrets', lifetime, secret);
    const prune = ReactServerDOMServer.unstable_pruneForBrowser;
    const Item = clientExports(function Item() {
      return null;
    });
    const check = async live => {
      const hostText = await run(<p>{secret}</p>, live);
      expect(hostText.errors.join()).toContain('no secrets');
      expect(Array.from(hostText.rows.values()).join()).not.toContain(secret);
      const prunedProp = await run(
        <Item data={prune({nested: [secret]})} />,
        live,
      );
      expect(prunedProp.errors.join()).toContain('no secrets');
    };
    await check(false);
    await check(true);
    expect(lifetime).toBeTruthy();
  });
});
