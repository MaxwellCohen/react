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

jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightHTMLFirst: true,
  enableFlightTee: true,
}));

global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.WritableStream =
  require('web-streams-polyfill/ponyfill/es6').WritableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

const fs = require('fs');
const {
  patchMessageChannel,
} = require('../../../../scripts/jest/patchMessageChannel');

const RECORD_FILE =
  '/private/tmp/claude-501/-Users-maxcohen-code-react-ecosystem/d4b14db0-012e-4635-a1be-6203fc5af593/scratchpad/advB-records.jsonl';
function record(name, obj) {
  fs.appendFileSync(RECORD_FILE, JSON.stringify({name, ...obj}) + '\n');
}

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
let reportedErrors;
let logs;

describe('HTML-first Flight adversarial B', () => {
  beforeEach(() => {
    jest.resetModules();
    reportedErrors = [];
    global.reportError = error => reportedErrors.push(error.message);

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
    logs = [];
    jest.spyOn(console, 'error').mockImplementation((...a) => {
      logs.push('error: ' + String(a[0]).slice(0, 300));
    });
    jest.spyOn(console, 'warn').mockImplementation((...a) => {
      logs.push('warn: ' + String(a[0]).slice(0, 300));
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
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

  function consume(rsc, extraOptions) {
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

  // Never throws: returns {main, html, serverErrors, htmlError}.
  async function renderTeeSafe(model, options, Root = Shell) {
    const tee = ReactServerDOMEdgeClient.createTee(createTeeManifest());
    const serverErrors = [];
    // What a framework does: the thenable settles when the HTML render is
    // done (resolved), or failed or was aborted (rejected). `htmlFirst: false`
    // turns HTML-first off.
    let htmlFirst = false;
    let settle = null;
    if (!options || options.htmlFirst !== false) {
      htmlFirst = new Promise((resolve, reject) => {
        settle = {resolve, reject};
      });
    }
    const stream = ReactServerDOMServer.renderToReadableStream(
      model,
      webpackMap,
      {
        tee,
        onError: e => {
          serverErrors.push(e.message);
        },
        ...options,
        htmlFirst,
      },
    );
    const browser = readAll(stream).then(
      v => ({v}),
      e => ({e}),
    );
    let response = null;
    function TeeRoot() {
      if (response === null) {
        response = ReactServerDOMEdgeClient.createFromTee(tee);
      }
      return <Root response={response} />;
    }
    let html = null;
    let htmlError = null;
    try {
      const htmlStream = await ReactDOMFizzServer.renderToReadableStream(
        <TeeRoot />,
        {
          onError: e => {
            htmlError = e.message;
          },
        },
      );
      await htmlStream.allReady;
      html = await readAll(htmlStream);
    } catch (e) {
      htmlError = e.message;
    }
    if (settle !== null) {
      if (htmlError !== null) {
        settle.reject(new Error(htmlError));
      } else {
        settle.resolve();
      }
    }
    const b = await browser;
    return {
      main: b.v === undefined ? null : b.v,
      mainError: b.e ? b.e.message : null,
      html,
      htmlError,
      serverErrors,
    };
  }

  async function flightFull(element) {
    return serverAct(async () =>
      readAll(
        ReactServerDOMServer.renderToReadableStream(element, webpackMap, {
          htmlFirst: false,
        }),
      ),
    );
  }

  async function navigate(root, app) {
    const main = await flightFull(app);
    expect(main).not.toContain('$J');
    const response = consume(main);
    await response;
    await act(() => root.render(<Shell response={response} />));
  }

  const norm = s => (s === null ? s : s.replace(/<!-- -->/g, ''));

  // Renders `makeModel()` in a mode, writes HTML to the document, hydrates.
  async function mount(makeModel, {stub, Root = Shell, tamper} = {}) {
    logs.length = 0;
    const r = await serverAct(() =>
      renderTeeSafe(makeModel(), {htmlFirst: stub}, Root),
    );
    const ssrLogs = logs.slice();
    logs.length = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);
    if (r.html !== null) {
      container.innerHTML = r.html;
    }
    if (tamper) {
      tamper(container);
    }
    const errors = [];
    let root = null;
    if (r.main !== null && r.html !== null) {
      const response = consume(r.main);
      await response;
      await act(() => {
        root = ReactDOMClient.hydrateRoot(
          container,
          <Root response={response} />,
          {
            onUncaughtError: e => errors.push('uncaught: ' + e.message),
            onCaughtError: e => errors.push('caught: ' + e.message),
            onRecoverableError: e =>
              errors.push('recoverable: ' + e.message.slice(0, 200)),
          },
        );
      });
    }
    return {
      ...r,
      container,
      root,
      errors,
      ssrLogs,
      hydrateLogs: logs.slice(),
    };
  }

  function snap(container) {
    return {
      html: norm(container.innerHTML),
      nodes: Array.from(container.querySelectorAll('*')).map(
        n => n.nodeName + '@' + n.namespaceURI,
      ),
    };
  }

  async function click(container, selector) {
    await act(() => container.querySelector(selector).click());
  }

  // Compare one scenario between flags-on and flags-off. Returns a diff or null.
  async function compareScenario(name, makeModel, opts = {}) {
    const {interact, Root} = opts;
    const out = {};
    for (const stub of [true, false]) {
      const label = stub ? 'on' : 'off';
      const m = await mount(makeModel, {stub, Root});
      const steps = {};
      let interactError = null;
      try {
        steps.hydrated = snap(m.container);
        if (interact) {
          await interact(m, steps);
        }
      } catch (e) {
        interactError = String(e.message).slice(0, 300);
      }
      out[label] = {
        ssrHtml: norm(m.html),
        htmlError: m.htmlError,
        serverErrors: m.serverErrors,
        errors: m.errors,
        steps,
        interactError,
        ssrLogs: m.ssrLogs,
        hydrateLogs: m.hydrateLogs,
        stubbed: m.main !== null && m.main.includes('$J'),
      };
    }
    const diffs = {};
    for (const k of [
      'ssrHtml',
      'htmlError',
      'serverErrors',
      'errors',
      'steps',
      'interactError',
      'ssrLogs',
      'hydrateLogs',
    ]) {
      if (JSON.stringify(out.on[k]) !== JSON.stringify(out.off[k])) {
        diffs[k] = {on: out.on[k], off: out.off[k]};
      }
    }
    record(name, {stubbedInOn: out.on.stubbed, out, diffs});
    return Object.keys(diffs).length === 0 ? null : {name, diffs};
  }

  function expectNoDiffs(results) {
    expect(results.filter(Boolean)).toEqual([]);
  }

  function describeChild(c) {
    if (c === null || typeof c !== 'object') {
      return String(c);
    }
    const isStub =
      c.props && typeof c.props.tag === 'string' && c.props.late !== undefined;
    return {
      tag: isStub ? c.props.tag : typeof c.type === 'string' ? c.type : '?',
      key: c.key,
      stub: !!isStub,
    };
  }

  async function decodedChildren(makeModel, stub) {
    const r = await serverAct(() =>
      renderTeeSafe(makeModel(), {htmlFirst: stub}),
    );
    const model = await consume(r.main);
    let kids = model.props.children;
    if (!Array.isArray(kids)) {
      kids = [kids];
    }
    return kids.map(describeChild);
  }

  // B1 ---------------------------------------------------------------
  it('B1 tag names with colon / custom elements round trip', async () => {
    const List = clientExports(function List({children}) {
      return <ul>{children}</ul>;
    });
    const cases = {
      hostPosition: () => (
        <div>
          {React.createElement('x:y', null, 'hi')}
          <my-widget class="a" data-n={1}>
            text
          </my-widget>
        </div>
      ),
      clientList: () => (
        <List>
          {[
            React.createElement('x:y', {key: 'k1'}, 'hi'),
            <my-widget key="k2" class="a" data-n={1}>
              text
            </my-widget>,
          ]}
        </List>
      ),
      topLevelColon: () => React.createElement('x:y', null, 'hi'),
      topLevelCustom: () => (
        <my-widget class="a" data-n={1}>
          text
        </my-widget>
      ),
    };
    const results = [];
    for (const name in cases) {
      results.push(await compareScenario('B1-' + name, cases[name]));
    }
    // Stub tag/key survive the decode.
    const on = await decodedChildren(cases.clientList, true);
    const off = await decodedChildren(cases.clientList, false);
    record('B1-decoded', {on, off});
    results.push(
      JSON.stringify(on.map(c => [c.tag, c.key])) ===
        JSON.stringify(off.map(c => [c.tag, c.key]))
        ? null
        : {name: 'B1 decoded stub tag/key', on, off},
    );
    expectNoDiffs(results);
  });

  // B2 ---------------------------------------------------------------
  it('B2 key edge cases on stubs in a reorderable client list', async () => {
    const List = clientExports(function List({children}) {
      const [rev, setRev] = React.useState(false);
      const items = Array.isArray(children) ? children : [children];
      return (
        <div>
          <button id="rev" onClick={() => setRev(true)}>
            rev
          </button>
          <ul>{rev ? items.slice().reverse() : items}</ul>
        </div>
      );
    });
    function Wrap({k}) {
      return <li>{'v' + k}</li>;
    }
    const keys = ['a:b', 'a,b', '$x', '', '__proto__', '😀', 'n\n"q', 0];
    const direct = () => (
      <List>
        {keys.map(k => (
          <li key={k}>{'v' + k}</li>
        ))}
      </List>
    );
    const viaWrapper = () => (
      <List>
        {keys.map(k => (
          <Wrap key={k} k={k} />
        ))}
      </List>
    );
    const results = [];
    for (const [name, make] of [
      ['direct', direct],
      ['wrapper', viaWrapper],
    ]) {
      const on = await decodedChildren(make, true);
      const off = await decodedChildren(make, false);
      record('B2-decoded-' + name, {on, off});
      results.push(
        JSON.stringify(on.map(c => [c.key])) ===
          JSON.stringify(off.map(c => [c.key]))
          ? null
          : {name: 'B2 decoded keys ' + name, on, off},
      );
      let before;
      results.push(
        await compareScenario('B2-' + name, make, {
          interact: async (m, steps) => {
            const lis = Array.from(m.container.querySelectorAll('li'));
            before = lis;
            await click(m.container, '#rev');
            steps.reordered = snap(m.container);
            const after = Array.from(m.container.querySelectorAll('li'));
            steps.movedNotRecreated = after.every(
              (n, i) => n === before[before.length - 1 - i],
            );
          },
        }),
      );
    }
    expectNoDiffs(results);
  });

  // B3 ---------------------------------------------------------------
  it('B3 getters are read once', async () => {
    const results = [];
    const styleGetter = () => {
      let n = 0;
      const style = {};
      Object.defineProperty(style, 'color', {
        enumerable: true,
        get() {
          return n++ === 0 ? 'red' : 'blue';
        },
      });
      return <div style={style}>x</div>;
    };
    const rawElement = () => {
      let n = 0;
      const base = <div>x</div>;
      const props = {
        get title() {
          return n++ === 0 ? 'first' : 'second';
        },
        children: 'x',
      };
      const el = {
        $$typeof: Symbol.for('react.transitional.element'),
        type: 'div',
        key: null,
        ref: null,
        props,
        _owner: base._owner,
      };
      if (__DEV__) {
        el._store = {};
        el._debugInfo = null;
        el._debugStack = base._debugStack;
        el._debugTask = base._debugTask;
      }
      return el;
    };
    for (const [name, make] of [
      ['style', styleGetter],
      ['rawProps', rawElement],
    ]) {
      const wrapped = () => <section>{make()}</section>;
      const on = await mount(wrapped, {stub: true});
      const off = await mount(wrapped, {stub: false});
      record('B3-' + name, {
        onHtml: norm(on.html),
        offHtml: norm(off.html),
        onMainHasValue: /red|blue|first|second/.exec(on.main || ''),
        offMain: off.main,
        onMain: on.main,
        onHydrated: norm(on.container.innerHTML),
        offHydrated: norm(off.container.innerHTML),
        onErrors: on.errors,
        offErrors: off.errors,
        onLogs: on.hydrateLogs.concat(on.ssrLogs),
        offLogs: off.hydrateLogs.concat(off.ssrLogs),
      });
      results.push(
        norm(on.html) === norm(off.html)
          ? null
          : {name, onHtml: norm(on.html), offHtml: norm(off.html)},
      );
    }
    expectNoDiffs(results);
  });

  // B4 ---------------------------------------------------------------
  // @gate enableTaint
  it('B4 taint in props and nested style values', async () => {
    const secret = 'very-secret-token-' + 'x'.repeat(40);
    const lifetime = {};
    ReactServer.experimental_taintUniqueValue('no secrets', lifetime, secret);
    const taintedStyle = {color: 'red'};
    ReactServer.experimental_taintObjectReference('no obj', taintedStyle);
    const cases = {
      prop: () => <div title={secret}>x</div>,
      styleValue: () => <div style={{color: secret}}>x</div>,
      styleObjectRef: () => <div style={taintedStyle}>x</div>,
      nestedChildProp: () => (
        <div>
          <p title={secret}>x</p>
        </div>
      ),
      nestedChildStyle: () => (
        <section>
          <p style={{color: secret}}>x</p>
        </section>
      ),
    };
    const results = [];
    for (const name in cases) {
      const run = async stub =>
        serverAct(() =>
          renderTeeSafe(
            (function Page() {
              return cases[name]();
            })(),
            {htmlFirst: stub},
          ),
        );
      const on = await run(true);
      const off = await run(false);
      record('B4-' + name, {on, off});
      const leak = r =>
        (r.html || '').includes(secret) ||
        (r.main || '').includes(secret) ||
        (r.html || '').includes('color:red') ||
        false;
      const summary = r => ({
        serverErrors: r.serverErrors,
        htmlError: r.htmlError,
        hasHtml: r.html !== null,
        leaks: name === 'styleObjectRef' ? undefined : leak(r),
        htmlHasRed: (r.html || '').includes('color:red'),
      });
      const a = summary(on);
      const b = summary(off);
      results.push(
        JSON.stringify(a) === JSON.stringify(b) ? null : {name, on: a, off: b},
      );
    }
    expect(lifetime).toBeTruthy();
    expectNoDiffs(results);
  });

  // B5 ---------------------------------------------------------------
  it('B5 invalid nesting inside stubbed static subtrees', async () => {
    const cases = {
      pDiv: () => (
        <section>
          <p>
            <div>x</div>
          </p>
        </section>
      ),
      tableNoTbody: () => (
        <section>
          <table>
            <tr>
              <td>x</td>
            </tr>
          </table>
        </section>
      ),
      nestedA: () => (
        <section>
          <a href="/1">
            a<a href="/2">b</a>
          </a>
        </section>
      ),
    };
    const results = [];
    for (const name in cases) {
      results.push(await compareScenario('B5-' + name, cases[name]));
    }
    expectNoDiffs(results);
  });

  // B6 ---------------------------------------------------------------
  it('B6 same element object reused', async () => {
    const Show = clientExports(function Show({el}) {
      return <article>{el}</article>;
    });
    const make = () => {
      const shared = <p className="s">{'shared' + FILL}</p>;
      return (
        <div>
          {shared}
          {shared}
          {shared}
          <div>{[<span key="k">{shared}</span>]}</div>
          <Show el={shared} />
        </div>
      );
    };
    const nodesBy = {};
    const result = await compareScenario('B6', make, {
      interact: async (m, steps) => {
        const before = Array.from(m.container.querySelectorAll('*'));
        await navigate(m.root, make());
        const after = Array.from(m.container.querySelectorAll('*'));
        steps.afterNav = snap(m.container);
        steps.identityKept =
          before.length === after.length &&
          before.every((n, i) => n === after[i]);
        nodesBy.x = 1;
      },
    });
    expectNoDiffs([result]);
  });

  // B7 ---------------------------------------------------------------
  it('B7 special containers', async () => {
    function mkToggle(wrapper) {
      return clientExports(function Toggle({children}) {
        const [show, setShow] = React.useState(true);
        return (
          <>
            <button id="t" onClick={() => setShow(!show)}>
              t
            </button>
            {wrapper(show ? children : null)}
          </>
        );
      });
    }
    const TableC = mkToggle(c => (
      <table>
        <tbody>{c}</tbody>
      </table>
    ));
    const SvgC = mkToggle(c => <svg id="s">{c}</svg>);
    const FoC = mkToggle(c => (
      <svg id="s">
        <foreignObject>{c}</foreignObject>
      </svg>
    ));
    const MathC = mkToggle(c => <math id="m">{c}</math>);
    const toggle = async (m, steps) => {
      await click(m.container, '#t');
      steps.hidden = snap(m.container);
      await click(m.container, '#t');
      steps.shown = snap(m.container);
      await navigate(m.root, m.__app());
      steps.afterNav = snap(m.container);
    };
    const withToggle = make => async (m, steps) => {
      m.__app = make;
      await toggle(m, steps);
    };
    const cases = {
      noscript: [
        () => (
          <div>
            <noscript>
              <p>ns</p>
            </noscript>
          </div>
        ),
      ],
      template: [
        () => (
          <div>
            <template>
              <p>t</p>
            </template>
          </div>
        ),
      ],
      svg: [
        () => (
          <div>
            <svg>
              <g>
                <path d="M0 0" />
              </g>
              <text>t</text>
            </svg>
          </div>
        ),
      ],
      foreignObject: [
        () => (
          <div>
            <svg>
              <foreignObject>
                <div>x</div>
              </foreignObject>
            </svg>
          </div>
        ),
      ],
      math: [
        () => (
          <div>
            <math>
              <mi>x</mi>
              <mo>+</mo>
            </math>
          </div>
        ),
      ],
      select: [
        () => (
          <div>
            <select>
              <optgroup label="g">
                <option>1</option>
              </optgroup>
            </select>
          </div>
        ),
      ],
      clientTable: [
        () => (
          <TableC>
            <tr>
              <td>1</td>
            </tr>
            <tr>
              <td>2</td>
            </tr>
          </TableC>
        ),
        true,
      ],
      clientSvg: [
        () => (
          <SvgC>
            <g>
              <path d="M0 0" />
            </g>
            <text>t</text>
          </SvgC>
        ),
        true,
      ],
      clientForeignObject: [
        () => (
          <FoC>
            <div>
              <b>x</b>
            </div>
          </FoC>
        ),
        true,
      ],
      clientMath: [
        () => (
          <MathC>
            <mi>x</mi>
            <mo>+</mo>
          </MathC>
        ),
        true,
      ],
    };
    const results = [];
    for (const name in cases) {
      const [make, toggles] = cases[name];
      results.push(
        await compareScenario('B7-' + name, make, {
          interact: toggles ? withToggle(make) : undefined,
        }),
      );
    }
    expectNoDiffs(results);
  });

  // B8 ---------------------------------------------------------------
  it('B8 DOM changed by someone else before hydration', async () => {
    const Page = ({v}) => (
      <main>
        <section className={v}>
          <p>content-{v}</p>
        </section>
      </main>
    );
    const run = async stub => {
      const steps = {};
      const m = await mount(() => <Page v="a" />, {
        stub,
        tamper: c => {
          const s = c.querySelector('section');
          s.setAttribute('data-ext', '1');
          s.classList.add('ext');
          const x = document.createElement('span');
          x.textContent = 'foreign';
          s.appendChild(x);
        },
      });
      steps.hydrated = snap(m.container);
      const errs = () => m.errors.slice();
      steps.hydrateErrors = errs();
      await navigate(m.root, <Page v="a" />);
      steps.sameNav = snap(m.container);
      await navigate(m.root, <Page v="b" />);
      steps.changedNav = snap(m.container);
      steps.errors = errs();
      steps.logs = m.hydrateLogs;
      return steps;
    };
    const on = await run(true);
    const off = await run(false);
    record('B8', {on, off});
    expect(on.errors).toEqual([]);
    expect(on.changedNav.html).toBe(off.changedNav.html);
  });

  // B9 ---------------------------------------------------------------
  it('B9 strings that look like stubs', async () => {
    const Echo = clientExports(function Echo({s, children}) {
      return (
        <b data-s={s} className="echo">
          {children}
        </b>
      );
    });
    const make = () => (
      <div>
        <Echo s="$J1:div">{'$J1:div:key'}</Echo>
        <Echo s="$J1:div:key" />
        <i data-fill={FILL}>{['$J1:div', '$J1:div:key']}</i>
        <p data-fill={FILL}>{'$J1:div'}</p>
        <p title="$J1:div:key" data-fill={FILL}>
          {'$J1:div:key'}
        </p>
        <ul>
          <li key="$J1:div">a</li>
          <li key="$J1:div:key">b</li>
        </ul>
      </div>
    );
    const on = await mount(make, {stub: true});
    const off = await mount(make, {stub: false});
    record('B9', {on: norm(on.html), off: norm(off.html), onErr: on.errors});
    expect(norm(on.html)).toBe(norm(off.html));
    expect(on.errors).toEqual([]);
    expect(norm(on.container.innerHTML)).toBe(norm(off.container.innerHTML));
    expect(on.container.textContent).toContain('$J1:div:key');
    expect(on.container.querySelector('.echo').getAttribute('data-s')).toBe(
      '$J1:div',
    );
    // A Server Component passing them through a key, in a client list.
    const List = clientExports(function List({children}) {
      return <ul>{children}</ul>;
    });
    const make2 = () => (
      <List>
        {['$J1:div', '$J1:div:key', '$J2:li:x'].map(k => (
          <li key={k}>{k}</li>
        ))}
      </List>
    );
    const kon = await decodedChildren(make2, true);
    const koff = await decodedChildren(make2, false);
    expect(kon.map(c => c.key)).toEqual(koff.map(c => c.key));
  });

  // B10 --------------------------------------------------------------
  it('B10 deep and wide static trees', async () => {
    // jest's loop guard counts the iterations of every loop, in React's source
    // as well (a Flight chunk with thousands of rows is one loop). Build the
    // tree without a loop in the test and raise the guard's limit, which is
    // what `global.__MAX_ITERATIONS__` is for, for this test only.
    const previousMax = global.__MAX_ITERATIONS__;
    global.__MAX_ITERATIONS__ = 1e9;
    const deepEl = n =>
      Array.from({length: n}).reduce(
        el => React.createElement('div', null, el),
        'x',
      );
    const attempt = async (make, stub) => {
      try {
        const m = await mount(make, {stub});
        if (m.html === null) {
          return (
            'html-null: ' +
            m.htmlError +
            ' | server: ' +
            m.serverErrors.join(';') +
            ' | main: ' +
            String(m.main).slice(0, 200)
          );
        }
        return {
          ok: true,
          htmlLen: m.html.length,
          mainLen: m.main.length,
          domLen: m.container.innerHTML.length,
          errors: m.errors,
          serverErrors: m.serverErrors,
        };
      } catch (e) {
        return 'threw: ' + String(e.message).slice(0, 100);
      }
    };
    const report = {};
    // Bisect the deepest nesting that works (hydrated without errors) in
    // each mode, within 25 levels, by recursion: no loops in the test.
    const works = async (n, stub) => {
      const r = await attempt(() => <section>{deepEl(n)}</section>, stub);
      return r.ok === true && r.errors.length === 0;
    };
    const deepest = async (lo, hi, stub) =>
      hi - lo <= 25
        ? lo
        : (await works(Math.floor((lo + hi) / 2), stub))
          ? deepest(Math.floor((lo + hi) / 2), hi, stub)
          : deepest(lo, Math.floor((lo + hi) / 2), stub);
    expect(await works(500, false)).toBe(true);
    expect(await works(500, true)).toBe(true);
    const deepOff = await deepest(500, 4000, false);
    const deepOn = await deepest(500, 4000, true);
    console.log(`B10 deepest nesting: off=${deepOff} on=${deepOn}`);
    record('B10-deepest', {on: deepOn, off: deepOff});
    const wide = n => () => (
      <ul>
        {Array.from({length: n}, (_, i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    );
    for (const n of [20000, 2000, 1000]) {
      const on = await attempt(wide(n), true);
      const off = await attempt(wide(n), false);
      report['wide' + n] = {on, off};
      record('B10-wide-' + n, {on, off});
      if (off.ok && !off.errors.length) {
        break;
      }
    }
    const bad = Object.keys(report).filter(k => {
      const {on, off} = report[k];
      // Only a case where flags-off works and flags-on does not is a finding.
      if (off.ok !== true || off.errors.length) {
        return false;
      }
      return (
        (on.ok === true) !== (off.ok === true) ||
        (on.ok && (on.errors.length || on.domLen !== off.domLen))
      );
    });
    global.__MAX_ITERATIONS__ = previousMax;
    expect(deepOn).toBeGreaterThanOrEqual(deepOff);
    expect(bad.map(k => [k, report[k]])).toEqual([]);
  }, 300000);

  // B11 --------------------------------------------------------------
  it('B11 re-encoding a decoded stubbed payload', async () => {
    const r = await serverAct(() =>
      renderTeeSafe(
        <main>
          <p>{'static' + FILL}</p>
        </main>,
        {htmlFirst: true},
      ),
    );
    expect(r.main).toContain('$J');
    const decoded = await ReactServerDOMEdgeClient.createFromReadableStream(
      stringToStream(r.main),
      {serverConsumerManifest: createTeeManifest()},
    );
    const errors = [];
    let out = null;
    let thrown = null;
    try {
      out = await serverAct(() =>
        readAll(
          ReactServerDOMServer.renderToReadableStream(decoded, webpackMap, {
            onError: e => {
              errors.push(e.message);
            },
          }),
        ),
      );
    } catch (e) {
      thrown = e.message;
    }
    record('B11', {out, errors, thrown, decodedType: String(decoded.type)});
    // Desired: a clear error, not empty content.
    const clear = errors.concat(thrown ? [thrown] : []).join('|');
    expect(clear).toMatch(/stub|static|htmlFirst|stubbed/i);
  });
});
