/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

/* eslint-disable no-for-of-loops/no-for-of-loops */

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
let ReactServerDOMServer;
let ReactServerDOMClient;
let ReactServerDOMEdgeClient;
let webpackModuleLoading;
let use;
let reportedErrors;

describe('ReactFlightDOMBrowser HTML-first Flight adversarial A', () => {
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

  // The server stubs an element only when it takes about 48 bytes or more in
  // the payload. A fixture appends this to its text to be stubbed.
  const FILL = ' filler text so this element is big enough to be stubbed';

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

  function consume(rsc, unused, extraOptions) {
    return ReactServerDOMClient.createFromReadableStream(
      stringToStream(rsc),
      extraOptions,
    );
  }

  function Shell({response}) {
    return use(response);
  }

  function createTeeManifest() {
    const moduleMap = {};
    for (const key in webpackMap) {
      const metadata = webpackMap[key];
      moduleMap[metadata.id] = {'*': metadata};
    }
    return {moduleMap, moduleLoading: webpackModuleLoading};
  }

  // What a framework does: the thenable settles when the HTML render is done
  // (resolved), or failed or was aborted (rejected). `htmlFirst: false` turns
  // HTML-first off.
  function createHtmlFirst(options) {
    if (options && options.htmlFirst === false) {
      return {htmlFirst: false, resolve() {}, reject() {}};
    }
    let resolve;
    let reject;
    const htmlFirst = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return {htmlFirst, resolve, reject};
  }

  // Fizz options that remember an error, for the thenable.
  function trackFizzErrors(fizzOptions, state) {
    return {
      ...fizzOptions,
      onError(error) {
        state.failed = true;
        return fizzOptions && fizzOptions.onError
          ? fizzOptions.onError(error)
          : undefined;
      },
    };
  }

  async function renderWithTeeInner(model, options, fizzOptions) {
    const tee = ReactServerDOMEdgeClient.createTee(createTeeManifest());
    const html1 = createHtmlFirst(options);
    const state = {failed: false};
    const stream = ReactServerDOMServer.renderToReadableStream(
      model,
      webpackMap,
      {tee, ...options, htmlFirst: html1.htmlFirst},
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
      trackFizzErrors(fizzOptions, state),
    );
    await htmlStream.allReady;
    if (state.failed) {
      html1.reject(new Error('Fizz reported an error'));
    } else {
      html1.resolve();
    }
    const html = await readAll(htmlStream);
    return {main: await browser, html};
  }

  function renderWithTee(model, options, fizzOptions) {
    return serverAct(() => renderWithTeeInner(model, options, fizzOptions));
  }

  async function flight(element, stub = true) {
    const rows = new Map();
    const options = stub
      ? {htmlFirst: {onValue: (id, value) => rows.set(id, value)}}
      : {htmlFirst: false};
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

  async function hydrate(main, html, flightOptions, rootOptions, scripts) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    if (scripts) {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      await act(async () => {
        await insertNodesAndExecuteScripts(temp, container, null);
        jest.runAllTimers();
      });
    } else {
      container.innerHTML = html;
    }
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
    return {container, errors, root, response};
  }

  async function renderFullPayload(root, app) {
    const full = await flight(app, false);
    expect(full.main).not.toContain('$J');
    const response = consume(full.main);
    await response;
    await act(() => root.render(<Shell response={response} />));
  }

  const norm = s => s.replace(/<!--[\s\S]*?-->/g, '');
  const noPreventNav = container =>
    container.addEventListener('click', e => e.preventDefault());

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Renders `App` with htmlFirst off and on, hydrates both, returns both.
  async function both(App, flightOptions, onReset) {
    if (onReset) onReset();
    const off = await renderWithTee(<App />, {htmlFirst: false});
    if (onReset) onReset();
    const on = await renderWithTee(<App />);
    return {off, on};
  }

  it('A1 asChild/Slot cloneElement on a stubbed child', async () => {
    const clicks = [];
    const Slot = clientExports(function Slot({children}) {
      return React.cloneElement(React.Children.only(children), {
        className: 'btn',
        'data-slot': '1',
        onClick: () => clicks.push(1),
      });
    });
    const App = () => (
      <Slot>
        <a href="/x">Link</a>
      </Slot>
    );
    const {off, on} = await both(App);
    expect(on.html).toContain(
      '<a href="/x" class="btn" data-slot="1">Link</a>',
    );
    const missingOn = jest.fn();
    const h = await hydrate(on.main, on.html, {onMissingHTML: missingOn});
    noPreventNav(h.container);
    const hOff = await hydrate(off.main, off.html);
    expect(missingOn).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
    const a = h.container.querySelector('a');
    expect(a.className).toBe('btn');
    expect(a.getAttribute('data-slot')).toBe('1');
    await act(() => a.click());
    expect(clicks.length).toBe(1);
    expect(norm(h.container.innerHTML)).toBe(norm(hOff.container.innerHTML));
    // Nothing is stubbed (a Client Component's children are never stubs), so
    // the payloads only differ in debug timestamps: size is information only.
    console.log(
      `A1 bytes off=${byteLength(off.main)} on=${byteLength(on.main)}`,
    );
  });

  describe('A2 client inspects its children', () => {
    async function check(Tabs, App) {
      const {off, on} = await both(App);
      expect(norm(on.html)).toBe(norm(off.html));
      const missing = jest.fn();
      const hOn = await hydrate(on.main, on.html, {onMissingHTML: missing});
      const hOff = await hydrate(off.main, off.html);
      console.log(
        'A2 observed: onHTML=' +
          on.html +
          '\noffHTML=' +
          off.html +
          '\nonDOM=' +
          hOn.container.innerHTML +
          '\noffDOM=' +
          hOff.container.innerHTML +
          '\nmissing=' +
          missing.mock.calls.length +
          ' errors=' +
          JSON.stringify(hOn.errors),
      );
      expect(hOn.errors).toEqual(hOff.errors);
      expect(norm(hOn.container.innerHTML)).toBe(
        norm(hOff.container.innerHTML),
      );
      expect(missing).not.toHaveBeenCalled();
    }

    it('A2a maps children props.title', async () => {
      const Tabs = clientExports(function Tabs({children}) {
        return (
          <>
            <ul>
              {React.Children.map(children, c => (
                <li>{c.props.title}</li>
              ))}
            </ul>
            {children}
          </>
        );
      });
      const App = () => (
        <Tabs>
          <section title="One">
            <p>{'static-one' + FILL}</p>
          </section>
          <section title="Two">
            <p>{'static-two' + FILL}</p>
          </section>
        </Tabs>
      );
      await check(Tabs, App);
    });

    it('A2b filters children by type', async () => {
      const Tabs = clientExports(function Tabs({children}) {
        return (
          <div>
            {React.Children.toArray(children).filter(c => c.type === 'li')}
          </div>
        );
      });
      const App = () => (
        <Tabs>
          <li>item-li</li>
          <p>item-p</p>
          <li>item-li2</li>
        </Tabs>
      );
      await check(Tabs, App);
    });
  });

  it('A3 children rendered twice, remount copies, navigate to full payload', async () => {
    let setShowM, setShowD;
    const Dup = clientExports(function Dup({children}) {
      const [m, sm] = React.useState(true);
      const [d, sd] = React.useState(true);
      setShowM = sm;
      setShowD = sd;
      return (
        <>
          {m ? <div className="mobile">{children}</div> : null}
          {d ? <div className="desktop">{children}</div> : null}
        </>
      );
    });
    const App = () => (
      <Dup>
        <p className="s">dup-static</p>
        <span>dup-span</span>
      </Dup>
    );
    const {off, on} = await both(App);
    const missing = jest.fn();
    const hOff = await hydrate(off.main, off.html);
    const h = await hydrate(on.main, on.html, {onMissingHTML: missing});
    const expectedCopy = '<p class="s">dup-static</p><span>dup-span</span>';
    const check = () => {
      expect(h.container.querySelector('.mobile').innerHTML).toBe(expectedCopy);
      expect(h.container.querySelector('.desktop').innerHTML).toBe(
        expectedCopy,
      );
    };
    expect(norm(h.container.innerHTML)).toBe(norm(hOff.container.innerHTML));
    check();
    await act(() => setShowM(false));
    expect(h.container.querySelector('.mobile')).toBe(null);
    expect(h.container.querySelector('.desktop').innerHTML).toBe(expectedCopy);
    await act(() => setShowM(true));
    check();
    await act(() => setShowD(false));
    await act(() => setShowD(true));
    check();
    expect(missing).not.toHaveBeenCalled();
    await renderFullPayload(h.root, <App />);
    check();
    expect(missing).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
  });

  describe('A4 server error inside one Suspense boundary', () => {
    let onServer = true;
    let App;
    beforeEach(() => {
      onServer = true;
      const Fragile = clientExports(function Fragile() {
        if (onServer) {
          throw new Error('window is not defined');
        }
        return <b>client-ok</b>;
      });
      App = () => (
        <main>
          <React.Suspense fallback={<i>loading</i>}>
            <p>{'before' + FILL}</p>
            <Fragile />
            <p>{'after' + FILL}</p>
          </React.Suspense>
        </main>
      );
    });
    it('A4 both paragraphs visible without onMissingHTML', async () => {
      onServer = true;
      const off = await renderWithTee(
        <App />,
        {htmlFirst: false},
        {onError() {}},
      );
      onServer = true;
      const on = await renderWithTee(<App />, undefined, {onError() {}});
      console.log(
        'A4 observed: html=' +
          on.html +
          '\nmain contains before=' +
          on.main.includes('before') +
          ' after=' +
          on.main.includes('after') +
          '\nmain=' +
          on.main,
      );
      onServer = false;
      const hOff = await hydrate(off.main, off.html);
      const missing = jest.fn();
      const h = await hydrate(on.main, on.html, {onMissingHTML: missing});
      console.log(
        'A4 observed: missingCalls=' +
          missing.mock.calls.length +
          ' dom=' +
          h.container.innerHTML +
          ' errors=' +
          JSON.stringify(h.errors) +
          ' offDom=' +
          hOff.container.innerHTML,
      );
      expect(missing).not.toHaveBeenCalled();
      expect(h.container.textContent).toBe(hOff.container.textContent);
      expect(h.container.textContent).toContain('before');
      expect(h.container.textContent).toContain('after');
      expect(h.errors).toEqual(hOff.errors);
    });
  });

  it('A5 late-row heuristic with a client component suspended during SSR', async () => {
    function makeApp() {
      let p = null;
      const Slow = clientExports(function Slow({children}) {
        if (p === null) {
          p = new Promise(resolve => {
            let n = 0;
            const step = () => (++n >= 5 ? resolve() : setTimeout(step, 0));
            setTimeout(step, 0);
          });
        }
        use(p);
        return <section>{children}</section>;
      });
      return () => (
        <main>
          <Slow>
            <div>
              <p>{'slow-static-text' + FILL}</p>
            </div>
          </Slow>
        </main>
      );
    }
    const off = await renderWithTee(React.createElement(makeApp()), {
      htmlFirst: false,
    });
    const on = await renderWithTee(React.createElement(makeApp()));
    console.log(
      `A5 bytes off=${byteLength(off.main)} on=${byteLength(on.main)} ` +
        `html has text=${on.html.includes('slow-static-text')} ` +
        `payload has text=${on.main.includes('slow-static-text')}\n` +
        `on.main=${on.main}`,
    );
    expect(on.html).toContain('slow-static-text');
    expect(on.main).not.toContain('slow-static-text');
  });

  [true, false].forEach(provide =>
    it(
      'A6 dehydrated boundary update before hydrate, onMissingHTML provided=' +
        provide,
      async () => {
        {
          let onServer = true;
          let setV;
          let gateResolve;
          const gate = new Promise(r => (gateResolve = r));
          const Ctx = React.createContext(0);
          const Provider = clientExports(function Provider({children}) {
            const [v, sv] = React.useState(0);
            setV = sv;
            return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
          });
          const Reader = clientExports(function Reader() {
            const v = React.useContext(Ctx);
            if (!onServer) {
              use(gate);
            }
            return <b>v:{v}</b>;
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
          const off = await renderWithTee(<App />, {htmlFirst: false});
          const on = await renderWithTee(<App />);
          onServer = false;
          Ctx._currentRenderer = null;
          Ctx._currentRenderer2 = null;
          const missing = jest.fn();
          const h = await hydrate(
            on.main,
            on.html,
            provide ? {onMissingHTML: missing} : undefined,
          );
          await act(() => setV(1));
          await act(async () => {
            gateResolve();
          });
          console.log(
            `A6 provide=${provide} missing=${missing.mock.calls.length} ` +
              `dom=${h.container.innerHTML} errors=${JSON.stringify(h.errors)} ` +
              `reported=${JSON.stringify(reportedErrors)}`,
          );
          // Desired: static content and new value visible without any callback.
          expect(missing).not.toHaveBeenCalled();
          expect(h.container.textContent).toContain('static-a');
          expect(h.container.textContent).toContain('static-b');
          expect(h.container.textContent).toContain('v:1');
          expect(reportedErrors).toEqual([]);
          void off;
        }
      },
    ),
  );

  it('A7 Fizz abort leaves a client-render boundary with stubbed content', async () => {
    let onServer = true;
    const Never = clientExports(function Never() {
      if (onServer) {
        use(new Promise(() => {}));
      }
      return <b>client-ok</b>;
    });
    const App = () => (
      <main>
        <React.Suspense fallback={<i>loading</i>}>
          <p>{'reached-before' + FILL}</p>
          <Never />
          <p>{'after-never' + FILL}</p>
          <div>
            <p>{'nested-after' + FILL}</p>
          </div>
        </React.Suspense>
      </main>
    );
    async function run(options) {
      return serverAct(async () => {
        const tee = ReactServerDOMEdgeClient.createTee(createTeeManifest());
        const html1 = createHtmlFirst(options);
        const browser = readAll(
          ReactServerDOMServer.renderToReadableStream(<App />, webpackMap, {
            tee,
            ...options,
            htmlFirst: html1.htmlFirst,
          }),
        );
        let response = null;
        function TeeRoot() {
          if (response === null) {
            response = ReactServerDOMEdgeClient.createFromTee(tee);
          }
          return <Shell response={response} />;
        }
        const ac = new AbortController();
        const htmlStream = await ReactDOMFizzServer.renderToReadableStream(
          <TeeRoot />,
          {signal: ac.signal, onError() {}},
        );
        await delay(20);
        ac.abort();
        // The Flight stream stays open until the HTML render settles.
        html1.reject(new Error('Fizz was aborted'));
        const main = await browser;
        const html = await readAll(htmlStream);
        return {main, html};
      });
    }
    const off = await run({htmlFirst: false});
    const on = await run();
    onServer = false;
    console.log(
      `A7 html=${on.html}\nmain has reached-before=${on.main.includes(
        'reached-before',
      )} after-never=${on.main.includes('after-never')} nested-after=${on.main.includes(
        'nested-after',
      )}`,
    );
    const hOff = await hydrate(off.main, off.html, undefined, undefined, true);
    const missing = jest.fn();
    const h = await hydrate(
      on.main,
      on.html,
      {onMissingHTML: missing},
      undefined,
      true,
    );
    console.log(
      `A7 missing=${missing.mock.calls.length} dom=${h.container.innerHTML} ` +
        `offDom=${hOff.container.innerHTML} errors=${JSON.stringify(h.errors)}`,
    );
    expect(missing).not.toHaveBeenCalled();
    expect(norm(h.container.innerHTML)).toBe(norm(hOff.container.innerHTML));
    ['reached-before', 'after-never', 'nested-after'].forEach(t =>
      expect(h.container.textContent).toContain(t),
    );
  });

  it('A8 two decodes of the same payload rendered into two roots', async () => {
    const Counter = clientExports(function Counter() {
      const [n, setN] = React.useState(0);
      return <button onClick={() => setN(n + 1)}>n:{n}</button>;
    });
    const App = () => (
      <main className="page">
        <h1>{'eight-heading' + FILL}</h1>
        <Counter />
        <p>{'eight-text' + FILL}</p>
      </main>
    );
    const {main, html} = await renderWithTee(<App />);
    const missing = jest.fn();
    const onMissingHTML = missing;
    const full = 'eight-heading' + FILL + 'n:0' + 'eight-text' + FILL;
    for (const order of ['root2first', 'root1first']) {
      const c1 = document.createElement('div');
      const c2 = document.createElement('div');
      document.body.append(c1, c2);
      c1.innerHTML = html;
      const nodes = Array.from(c1.querySelectorAll('*'));
      const r1 = consume(main, undefined, {onMissingHTML});
      const r2 = consume(main, undefined, {onMissingHTML});
      await r1;
      await r2;
      let root1, root2;
      await act(() => {
        root1 = ReactDOMClient.hydrateRoot(c1, <Shell response={r1} />);
      });
      await act(() => {
        root2 = ReactDOMClient.createRoot(c2);
        root2.render(<Shell response={r2} />);
      });
      expect(c1.textContent).toBe(full);
      expect(c2.textContent).toBe(full);
      expect(Array.from(c1.querySelectorAll('*'))).toEqual(nodes);
      Array.from(c1.querySelectorAll('*')).forEach((n, i) =>
        expect(n).toBe(nodes[i]),
      );
      if (order === 'root2first') {
        await act(() => root2.unmount());
        expect(c1.textContent).toBe(full);
        await act(() => c1.querySelector('button').click());
        expect(c1.textContent).toBe(
          'eight-heading' + FILL + 'n:1eight-text' + FILL,
        );
        await act(() => root1.unmount());
      } else {
        await act(() => root1.unmount());
        expect(c2.textContent).toBe(full);
        await act(() => c2.querySelector('button').click());
        expect(c2.textContent).toBe(
          'eight-heading' + FILL + 'n:1eight-text' + FILL,
        );
        await act(() => root2.unmount());
      }
    }
    expect(missing).not.toHaveBeenCalled();
  });

  it('A9 late-row fill, then refreshes to changed content, then unmount', async () => {
    const Panel = clientExports(function Panel({children}) {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setOpen(!open)}>toggle</button>
          {open ? <aside>{children}</aside> : null}
        </div>
      );
    });
    const makeApp = (text, cls, page) => () => (
      <main>
        <article className={cls}>{page}</article>
        <Panel>
          <p className={cls} data-v={text}>
            {text}
          </p>
        </Panel>
      </main>
    );
    const App1 = makeApp('modal-v1', 'a', 'page-v1' + FILL);
    const {main, html} = await renderWithTee(<App1 />);
    expect(main).toContain('modal-v1');
    const missing = jest.fn();
    const h = await hydrate(main, html, {onMissingHTML: missing});
    await act(() => h.container.querySelector('button').click());
    expect(h.container.querySelector('aside').innerHTML).toBe(
      '<p class="a" data-v="modal-v1">modal-v1</p>',
    );
    await renderFullPayload(
      h.root,
      makeApp('modal-v2', 'b', 'page-v2' + FILL)(),
    );
    expect(h.container.querySelector('aside').innerHTML).toBe(
      '<p class="b" data-v="modal-v2">modal-v2</p>',
    );
    expect(h.container.querySelector('article').outerHTML).toBe(
      '<article class="b">page-v2' + FILL + '</article>',
    );
    await renderFullPayload(
      h.root,
      makeApp('modal-v3', 'c', 'page-v3' + FILL)(),
    );
    expect(h.container.querySelector('aside').innerHTML).toBe(
      '<p class="c" data-v="modal-v3">modal-v3</p>',
    );
    expect(h.container.querySelector('article').outerHTML).toBe(
      '<article class="c">page-v3' + FILL + '</article>',
    );
    await act(() => h.root.unmount());
    expect(h.container.innerHTML).toBe('');
    expect(missing).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
  });

  it('A10 useSyncExternalStore removes then restores stubbed children', async () => {
    let snapshot = false;
    const listeners = new Set();
    const subscribe = l => {
      listeners.add(l);
      return () => listeners.delete(l);
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
            <p>{'ten-static' + FILL}</p>
          </section>
        </React.Suspense>
      </Gate>
    );
    const off = await renderWithTee(<App />, {htmlFirst: false});
    const on = await renderWithTee(<App />);
    expect(on.html).toContain('ten-static');
    const missing = jest.fn();
    const h = await hydrate(on.main, on.html, {onMissingHTML: missing});
    const hOff = await hydrate(off.main, off.html);
    console.log(
      `A10 after hydrate: dom=${h.container.innerHTML} off=${hOff.container.innerHTML} errors=${JSON.stringify(h.errors)}`,
    );
    expect(h.container.textContent).toBe('');
    snapshot = true;
    await act(() => listeners.forEach(l => l()));
    console.log(
      `A10 after toggle: dom=${h.container.innerHTML} off=${hOff.container.innerHTML} missing=${missing.mock.calls.length}`,
    );
    expect(missing).not.toHaveBeenCalled();
    expect(h.container.innerHTML).toBe(
      '<section><p>ten-static' + FILL + '</p></section>',
    );
    expect(reportedErrors).toEqual([]);
  });
});
