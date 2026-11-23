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
let ReactServerDOMEdgeClient;
let webpackModuleLoading;
let use;

describe('ReactFlightDOMBrowser html-first stubbing', () => {
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
    webpackModuleLoading = WebpackMock.moduleLoading;
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
    ReactServerDOMEdgeClient = jest.requireActual(
      'react-server-dom-webpack/client.edge',
    );
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

  // The browser consumer only gets the (stubbed) stream and adopts the server
  // DOM instead of rendering the stubbed content.
  function consume(rsc) {
    return ReactServerDOMClient.createFromReadableStream(stringToStream(rsc));
  }

  function Shell({response}) {
    return use(response);
  }

  const CSS = '.a{color:red}\n'.repeat(500); // ~7KB
  const JSON_LD = JSON.stringify({
    '@context': 'https://schema.org',
    items: Array.from({length: 200}, (_, i) => ({name: 'item-' + i})),
  });
  const BIG = 'big-text-'.repeat(300);

  function createTeeManifest() {
    const moduleMap = {};
    for (const key in webpackMap) {
      const metadata = webpackMap[key];
      moduleMap[metadata.id] = {'*': metadata};
    }
    return {moduleMap, moduleLoading: webpackModuleLoading};
  }

  // Without `stub` this is a plain render (the baseline). With it, this is
  // what a framework does: the Flight render feeds a tee that Fizz reads in
  // this process. Returns the browser's payload and the HTML.
  async function flightInner(element, stub) {
    if (!stub) {
      const main = await readAll(
        ReactServerDOMServer.renderToReadableStream(element, webpackMap, {
          htmlFirst: false,
        }),
      );
      return {main, html: null};
    }
    const tee = ReactServerDOMEdgeClient.createTee(createTeeManifest());
    let htmlDone;
    const htmlFirst = new Promise((resolve, reject) => {
      htmlDone = {resolve, reject};
    });
    const stream = ReactServerDOMServer.renderToReadableStream(
      element,
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
    const html = await readAll(htmlStream);
    return {main: await browser, html};
  }

  function flight(element, stub) {
    return serverAct(() => flightInner(element, stub));
  }

  // No reader: the elements of the stubbed rows go to `onValue`.
  async function flightRows(element, extraOptions) {
    const rows = new Map();
    const main = await serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(element, webpackMap, {
          htmlFirst: {onValue: (id, value) => rows.set(id, value)},
          ...extraOptions,
        }),
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
    const stubbed = await flight(<App />, true);
    expect(baseline.main).toContain('item-199');
    expect(baseline.main).toContain('.a{color:red}');
    expect(stubbed.main).not.toContain('item-199');
    expect(stubbed.main).not.toContain('.a{color:red}');
    expect(stubbed.main).not.toContain('big-text-');
    // No text rows (2:T...) leaked into the main stream either.
    expect(stubbed.main).not.toMatch(/^[0-9a-f]+:T/m);
    expect(stubbed.main).toContain('"clicks"');
    expect(byteLength(stubbed.main)).toBeLessThan(2000);
    // The tee reader renders the content for the HTML.
    expect(stubbed.html).toContain('item-199');
    expect(stubbed.html).toContain('big-text-');
  });

  it('does not stub resources or executable scripts', async () => {
    const {main, rows} = await flightRows(
      <div>
        <script>{'window.__x=1'}</script>
        <script type="application/ld+json" src="/x.json" />
        <style precedence="default" href="s">
          {'.zz{color:blue}'}
        </style>
      </div>,
    );
    expect(rows.size).toBe(0);
    expect(main).toContain('window.__x=1');
    expect(main).toContain('.zz{color:blue}');
  });

  it('hydrates SSR HTML with the stripped stream without mismatches', async () => {
    const App = makeApp();
    const stubbed = await flight(<App />, true);
    const html = stubbed.html;
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
    const response = consume(stubbed.main);
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

    // Navigation: a full (non stubbed) payload has the real new content.
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
    const stubbed = await flight(<Doc />, true);
    expect(stubbed.main).not.toContain('item-199');
    // Static content inside a Suspense boundary is stubbed too and adopted
    // once the boundary hydrates.
    expect(stubbed.main).not.toContain('late-text');
    expect(stubbed.main).toContain('$J');

    const html = stubbed.html;
    expect(html).toContain('item-199');
    expect(html).toContain('late-text');
    document.open();
    document.write(html);
    document.close();
    const style = document.head.querySelector('style');
    const script = document.head.querySelector('script[type]');
    const late = document.getElementById('late');
    const button = document.querySelector('button');

    const response = consume(stubbed.main);
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

  it('never stubs client components: they keep their full props', async () => {
    const Row = clientExports(function Row({name, details}) {
      return (
        <li>
          {name}
          <i title={details.notes} />
        </li>
      );
    });
    const details = {notes: 'client-notes-'.repeat(100)};
    const App = () => (
      <ul>
        <Row name="a" details={details} />
      </ul>
    );
    const stubbed = await flightRows(<App />);
    // The client element and its props stay in the stream (hydration needs
    // them); the host skeleton around it is not static.
    expect(stubbed.main).toContain('client-notes-');
    expect(stubbed.main).toContain('"name"');
    expect(stubbed.rows.size).toBe(0);
    const browser = await consume(stubbed.main);
    expect(browser.props.children.props.details).toEqual(details);
  });

  it('hands off client components inside static server regions to hydration', async () => {
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
        {['a', 'b', 'c'].map(l => (
          <li key={l} className="item">
            {l}
          </li>
        ))}
      </ul>
    );
    const Mixed = () => (
      <ul>
        <li key="a" className="item">
          a
        </li>
        <Counter key="c" label="clicks" />
        <li key="b" className="item">
          b
        </li>
      </ul>
    );

    // All static: the whole <ul> collapses into one stub.
    const allStatic = await flight(<Static />, true);
    expect(allStatic.main).toContain('$J');
    expect(allStatic.main).not.toContain('"ul"');
    expect((allStatic.main.match(/\$J/g) || []).length).toBe(1);

    // One interactive child: skeleton stays, Counter keeps its props.
    const mixed = await flight(<Mixed />, true);
    expect(mixed.main).toContain('"ul"');
    expect(mixed.main).toContain('"clicks"');
    expect(mixed.main).not.toContain('"a"');
    expect((mixed.main.match(/\$J/g) || []).length).toBe(2);

    const html = mixed.html;
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

  it('hands live elements to onValue when there is no reader', async () => {
    const Counter = clientExports(function Counter({label}) {
      return (
        <li>
          <button>{label}</button>
        </li>
      );
    });
    const App = () => (
      <section>
        <h1>{'static '.repeat(300)}</h1>
        <ul>
          <li key="a">a</li>
          <Counter key="c" label="clicks" />
          <li key="b">b</li>
        </ul>
      </section>
    );
    const teed = await flight(<App />, true);
    const live = await flightRows(<App />);
    // The rows are live elements, never strings, and hold server output only.
    expect(live.rows.size).toBeGreaterThan(0);
    Array.from(live.rows.values()).forEach(v =>
      expect(typeof v).toBe('object'),
    );
    expect(live.main).not.toContain('static static');
    expect(live.main).toContain('"clicks"');
    // The model row is the same with a reader and without one.
    const modelRow = main => main.split('\n').find(l => l.includes('$J'));
    expect(modelRow(live.main)).toBe(modelRow(teed.main));
    expect((live.main.match(/\$J/g) || []).length).toBe(live.rows.size);
    expect(teed.html).toContain('static static');
  });

  it('stubs keyed server components that render array children', async () => {
    const Row = ({name}) => (
      <tr className="r">
        <td>
          {name} <b>x</b>
        </td>
      </tr>
    );
    const Counter = clientExports(function Counter() {
      return <tr />;
    });
    const App = () => (
      <table>
        <tbody>
          {['a', 'b'].map(n => (
            <Row key={n} name={n} />
          ))}
          <Counter />
        </tbody>
      </table>
    );
    const stubbed = await flight(<App />, true);
    expect((stubbed.main.match(/\$J/g) || []).length).toBe(2);
    const html = stubbed.html;
    expect(html).toContain('<tr class="r"><td>a<!-- --> <b>x</b></td></tr>');
  });

  // @gate enableTaint
  it('applies taint checks to the elements handed to onValue', async () => {
    const secret = 'very-secret-token-' + 'x'.repeat(40);
    const run = async element => {
      const errors = [];
      const result = await flightRows(element, {
        onError: e => {
          errors.push(e.message);
        },
      });
      return {...result, errors};
    };
    // The taint lives as long as this object does; keep it referenced.
    const lifetime = {};
    ReactServer.experimental_taintUniqueValue('no secrets', lifetime, secret);
    const hostText = await run(<p>{secret}</p>);
    expect(hostText.errors.join()).toContain('no secrets');
    expect(Array.from(hostText.rows.values()).join()).not.toContain(secret);
    expect(lifetime).toBeTruthy();
  });
});
