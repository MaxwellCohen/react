/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

import {patchSetImmediate} from '../../../../scripts/jest/patchSetImmediate';

let clientExports;
let turbopackMap;
let turbopackModuleLoading;
let React;
let ReactDOMServer;
let ReactDOMFizzStatic;
let ReactServer;
let FlightReactDOM;
let ReactServerDOMServer;
let ReactServerDOMStaticServer;
let ReactServerDOMClient;
let Stream;
let AsyncLocalStorage;
let serverAct;
let assertConsoleErrorDev;

// A tee reads one Flight render in the same process. Each test reads the same
// model through the tee and through the bytes, and compares what Fizz renders.
describe('ReactFlightTurbopackDOMTee', () => {
  beforeEach(() => {
    jest.resetModules();

    patchSetImmediate();
    serverAct = require('internal-test-utils').serverAct;
    assertConsoleErrorDev =
      require('internal-test-utils').assertConsoleErrorDev;
    AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;

    // Simulate the condition resolution
    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-turbopack/server', () =>
      require('react-server-dom-turbopack/server.node'),
    );
    jest.mock('react-server-dom-turbopack/static', () =>
      require('react-server-dom-turbopack/static.node'),
    );
    ReactServer = require('react');
    FlightReactDOM = require('react-dom');
    ReactServerDOMServer = require('react-server-dom-turbopack/server');
    ReactServerDOMStaticServer = require('react-server-dom-turbopack/static');

    const TurbopackMock = require('./utils/TurbopackMock');
    clientExports = TurbopackMock.clientExports;
    turbopackMap = TurbopackMock.turbopackMap;
    turbopackModuleLoading = TurbopackMock.moduleLoading;

    jest.resetModules();
    __unmockReact();
    jest.unmock('react-server-dom-turbopack/server');
    jest.unmock('react-server-dom-turbopack/static');
    jest.mock('react-server-dom-turbopack/client', () =>
      jest.requireActual('react-server-dom-turbopack/client.node'),
    );

    React = require('react');
    ReactDOMServer = require('react-dom/server.node');
    ReactDOMFizzStatic = require('react-dom/static.node');
    ReactServerDOMClient = require('react-server-dom-turbopack/client');
    Stream = require('stream');
  });

  const manifest = () => ({
    moduleMap: null,
    moduleLoading: turbopackModuleLoading,
  });

  function readResult(stream) {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const writable = new Stream.PassThrough();
      writable.setEncoding('utf8');
      writable.on('data', chunk => {
        buffer += chunk;
      });
      writable.on('error', error => {
        reject(error);
      });
      writable.on('end', () => {
        resolve(buffer);
      });
      stream.pipe(writable);
    });
  }

  // Starts a Flight render of `model`. With `useTee`, the render also writes
  // to a tee, which the returned `read` reads from. Otherwise `read` reads the
  // bytes. `read` has to be called from the reader's context.
  function startFlight(model, useTee, options) {
    const tee = useTee
      ? ReactServerDOMClient.createTee(manifest(), options && options.tee)
      : undefined;
    const readable = new Stream.PassThrough();
    const flight = ReactServerDOMServer.renderToPipeableStream(
      model,
      turbopackMap,
      {
        ...(options && options.flight),
        tee,
      },
    );
    flight.pipe(readable);
    let response = null;
    return {
      tee,
      flight,
      read() {
        if (response === null) {
          response = useTee
            ? ReactServerDOMClient.createFromTee(tee)
            : ReactServerDOMClient.createFromNodeStream(
                readable,
                manifest(),
                options && options.tee,
              );
        }
        return response;
      },
    };
  }

  function createClientRoot(flight) {
    return function ClientRoot() {
      return React.use(flight.read());
    };
  }

  // Renders the Client Component that reads `flight` with Fizz.
  async function renderFizz(flight, options) {
    const ssrStream = await serverAct(() =>
      ReactDOMServer.renderToPipeableStream(
        React.createElement(createClientRoot(flight)),
        options && options.fizz,
      ),
    );
    return readResult(ssrStream);
  }

  // The Flight render runs to completion before Fizz starts, so every row,
  // hint and preinit arrives before the reader exists.
  async function renderAfterFlight(createModel, useTee, options) {
    let flight;
    await serverAct(() => {
      flight = startFlight(createModel(), useTee, options);
    });
    return renderFizz(flight, options);
  }

  // Reads one render through the tee and, as the browser would, through its
  // bytes.
  async function readTeeAndBytes(model, onError) {
    const tee = ReactServerDOMClient.createTee(manifest());
    const readable = new Stream.PassThrough();
    let fromTee;
    let fromBytes;
    await serverAct(() => {
      ReactServerDOMServer.renderToPipeableStream(model, turbopackMap, {
        tee,
        onError,
      }).pipe(readable);
      fromTee = ReactServerDOMClient.createFromTee(tee);
      fromBytes = ReactServerDOMClient.createFromNodeStream(
        readable,
        manifest(),
      );
    });
    return {fromTee: await fromTee, fromBytes: await fromBytes, tee};
  }

  // @gate enableFlightTee
  it('builds model rows by value, sharing data that parses to the same values', async () => {
    const data = {a: 1, list: [1, 'two', null, true]};
    const model = {data, date: new Date(0), text: '$escaped'};
    const {fromTee, fromBytes, tee} = await readTeeAndBytes(model);
    expect(fromTee).toEqual(fromBytes);
    expect(tee._rowsByValue).toBeGreaterThan(0);
    // An object is copied only once one of its values differs from what was
    // read, like the decoded Date here.
    expect(fromTee).not.toBe(model);
    expect(fromTee.data).toBe(data);
    expect(fromTee.data.list).toBe(data.list);
  });

  // @gate enableFlightTee
  it('deletes undefined in objects and keeps it in arrays', async () => {
    const {fromTee, fromBytes} = await readTeeAndBytes({
      obj: {a: undefined, b: 1},
      arr: [undefined, 1],
    });
    expect(fromTee).toEqual(fromBytes);
    expect('a' in fromBytes.obj).toBe(false);
    expect('a' in fromTee.obj).toBe(false);
    expect(0 in fromTee.arr).toBe(true);
  });

  // @gate enableFlightTee
  it('decodes values that need it, like an invalid Date or a Map subclass', async () => {
    class MyMap extends Map {}
    class MySet extends Set {}
    const {fromTee, fromBytes} = await readTeeAndBytes({
      invalid: new Date(NaN),
      date: new Date(0),
      big: 10n,
      nan: NaN,
      map: new MyMap([['a', 1]]),
      set: new MySet([1]),
      text: '$escaped',
    });
    expect(fromTee).toEqual(fromBytes);
    expect(fromTee.invalid).toBe(null);
    expect(fromTee.date).toEqual(new Date(0));
    expect(Object.getPrototypeOf(fromTee.map)).toBe(Map.prototype);
    expect(Object.getPrototypeOf(fromTee.set)).toBe(Set.prototype);
    expect(fromTee.text).toBe('$escaped');
  });

  // @gate enableFlightTee
  it('shares a Map referenced twice in one row, like the browser', async () => {
    const map = new Map([['a', {b: 1}]]);
    const {fromTee, fromBytes} = await readTeeAndBytes({x: map, y: [map]});
    expect(fromTee).toEqual(fromBytes);
    expect(fromBytes.y[0]).toBe(fromBytes.x);
    expect(fromTee.y[0]).toBe(fromTee.x);
  });

  // @gate enableFlightTee
  it('resolves a cycle through an element’s props', async () => {
    function Client({data}) {
      return React.createElement(
        'span',
        null,
        data.self === data ? data.self.label : 'not the same object',
      );
    }
    const ClientReference = clientExports(Client);
    function createModel() {
      const data = {label: 'cyclic'};
      data.self = data;
      return ReactServer.createElement(ClientReference, {data});
    }
    const html = await renderAfterFlight(createModel, true);
    expect(html).toBe(await renderAfterFlight(createModel, false));
    expect(html).toContain('cyclic');
  });

  // @gate enableFlightTee
  it('reads an iterator the server drained, and keyed Server Components', async () => {
    function* items() {
      yield ReactServer.createElement('li', {key: 'a'}, 'a');
      yield ReactServer.createElement('li', {key: 'b'}, 'b');
    }
    function Item({label}) {
      return ReactServer.createElement('span', null, label);
    }
    function createModel() {
      const keyed = ReactServer.createElement(Item, {key: 'k', label: 'one'});
      return ReactServer.createElement('div', null, keyed, [
        keyed,
        ReactServer.createElement(Item, {key: 'm', label: 'two'}),
      ]);
    }
    expect(await renderAfterFlight(createModel, true)).toBe(
      await renderAfterFlight(createModel, false),
    );
    const {fromTee, fromBytes} = await readTeeAndBytes({
      node: createModel(),
      drained: items(),
    });
    expect(Array.from(fromTee.drained)).toEqual(Array.from(fromBytes.drained));
    fromTee.drained = fromBytes.drained = null;
    expect(fromTee).toEqual(fromBytes);
  });

  // @gate enableFlightTee
  it('fills in references inside props that resolve later', async () => {
    function Client({value, children}) {
      return React.createElement('p', null, React.use(value), children);
    }
    let resolveChunk;
    const ClientReference = clientExports(
      Client,
      'path/to/async-chunk.js',
      new Promise(resolve => (resolveChunk = resolve)),
    );
    async function Later() {
      await Promise.resolve();
      return ReactServer.createElement('b', null, 'later');
    }
    function createModel() {
      return ReactServer.createElement(
        ClientReference,
        {value: Promise.resolve('resolved')},
        ReactServer.createElement(Later),
      );
    }
    // Both Flight renders finish before Fizz starts, and the chunk loads only
    // once both Fizz renders are waiting on it.
    let flights;
    await serverAct(() => {
      flights = {
        tee: startFlight(createModel(), true),
        bytes: startFlight(createModel(), false),
      };
    });
    const fromTee = renderFizz(flights.tee);
    const fromBytes = renderFizz(flights.bytes);
    await serverAct(() => resolveChunk());
    expect(await fromTee).toBe(await fromBytes);
    expect(await fromTee).toContain('later');
  });

  // @gate enableFlightTee
  it('makes the element around an errored row an errored lazy', async () => {
    function Client({children}) {
      return React.createElement('div', null, children);
    }
    const ClientReference = clientExports(Client);
    function Throws() {
      throw new Error('server error');
    }
    function createModel() {
      return ReactServer.createElement(
        'section',
        null,
        ReactServer.createElement(
          ReactServer.Suspense,
          {fallback: 'loading'},
          ReactServer.createElement(
            ClientReference,
            null,
            ReactServer.createElement(Throws),
          ),
        ),
      );
    }
    const options = {
      flight: {onError: () => 'digest'},
      fizz: {onError() {}},
    };
    let html;
    await serverAct(async () => {
      html = {
        tee: await renderAfterFlight(createModel, true, options),
        bytes: await renderAfterFlight(createModel, false, options),
      };
    });
    // DEV puts the error's stack in the HTML. It's created on a different
    // stack with a tee.
    const withoutStack = markup => markup.replace(/ data-stck="[^"]*"/g, '');
    expect(withoutStack(html.tee)).toBe(withoutStack(html.bytes));
    expect(html.tee).toContain('loading');
  });

  // @gate enableFlightTee
  it('moves debug info onto elements, without writing to the server’s arrays', async () => {
    const shared = ['a', 'b'];
    function Component() {
      return shared;
    }
    function createModel() {
      return {node: ReactServer.createElement(Component)};
    }
    const {fromTee, fromBytes} = await readTeeAndBytes(createModel());
    expect(fromTee).toEqual(fromBytes);
    expect(Object.getOwnPropertyNames(shared)).toEqual(['0', '1', 'length']);
    if (__DEV__) {
      const names = value =>
        (value._debugInfo || []).map(info => info.name).filter(Boolean);
      expect(names(fromTee.node)).toEqual(names(fromBytes.node));
      expect(names(fromTee.node)).toEqual(['Component']);
    }
  });

  // SSR has to see what parsing the bytes gives. In DEV that includes values
  // the wire doesn't carry, for objects Flight warns about. Production only
  // checks prototypes, and shares the rest.

  // @gate enableFlightTee
  it('copies an object with a getter in DEV, reading it once', async () => {
    let reads = 0;
    const data = {
      get value() {
        return ++reads;
      },
    };
    const {fromTee, fromBytes} = await readTeeAndBytes({data});
    if (__DEV__) {
      expect(fromTee).toEqual(fromBytes);
      expect(fromTee.data).not.toBe(data);
      expect(fromTee.data.value).toBe(1);
      // DEV reads each value once more, only to warn about it.
      expect(reads).toBe(2);
      expect(Object.getOwnPropertyDescriptor(fromTee.data, 'value').get).toBe(
        undefined,
      );
    } else {
      // SSR reads the getter again, as stringify does for the bytes.
      expect(fromTee.data).toBe(data);
    }
  });

  // @gate enableFlightTee
  it('copies an object with a symbol key or a non-enumerable property in DEV', async () => {
    const withSymbol = {a: 1, [Symbol('hidden')]: 2};
    const withHidden = {a: 1};
    Object.defineProperty(withHidden, 'hidden', {value: 2, enumerable: false});
    const {fromTee, fromBytes} = await readTeeAndBytes({
      withSymbol,
      withHidden,
    });
    assertConsoleErrorDev([
      'Only plain objects can be passed to Client Components from Server Components. ' +
        'Objects with symbol properties like hidden are not supported.\n' +
        '  {withSymbol: {a: 1}, withHidden: {a: 1}}\n' +
        '               ^^^^^^',
      'Only plain objects can be passed to Client Components from Server Components. ' +
        'Classes or other objects with methods are not supported.\n' +
        '  {withSymbol: {a: 1}, withHidden: {a: 1}}\n' +
        '                                   ^^^^^^',
    ]);
    if (__DEV__) {
      expect(fromTee).toEqual(fromBytes);
      expect(fromTee.withSymbol).not.toBe(withSymbol);
      expect(Object.getOwnPropertySymbols(fromTee.withSymbol)).toEqual([]);
      expect(fromTee.withHidden).not.toBe(withHidden);
      expect('hidden' in fromTee.withHidden).toBe(false);
    } else {
      expect(fromTee.withSymbol).toBe(withSymbol);
      expect(fromTee.withHidden).toBe(withHidden);
    }
  });

  // @gate enableFlightTee
  it('copies an object from another realm and an array with a hole', async () => {
    const vm = require('vm');
    // eslint-disable-next-line no-sparse-arrays
    const holey = [1, , 3];
    const otherRealm = vm.runInNewContext('({a: 1})');
    const withProto = JSON.parse('{"__proto__": {"x": 1}, "a": 1}');
    const {fromTee, fromBytes} = await readTeeAndBytes({
      holey,
      otherRealm,
      withProto,
    });
    assertConsoleErrorDev([
      'Expected not to serialize an object with own property `__proto__`. When parsed this property will be omitted.\n' +
        '  {__proto__: {x: 1}, a: 1}\n' +
        '              ^^^^^^',
    ]);
    expect(fromTee.holey).toEqual(fromBytes.holey);
    expect(1 in fromTee.holey).toBe(true);
    expect(fromTee.otherRealm).toEqual(fromBytes.otherRealm);
    expect(Object.getPrototypeOf(fromTee.otherRealm)).toBe(Object.prototype);
    if (__DEV__) {
      expect(fromTee).toEqual(fromBytes);
      expect(
        Object.prototype.hasOwnProperty.call(fromTee.withProto, '__proto__'),
      ).toBe(false);
    } else {
      expect(fromTee.withProto).toBe(withProto);
    }
  });

  // @gate enableFlightTee
  it('shares array subclasses and arrays with extra properties', async () => {
    class MyArray extends Array {}
    const sub = MyArray.from([1, 2]);
    const match = 'abc'.match(/b/);
    const {fromTee, fromBytes} = await readTeeAndBytes({sub, match});
    expect(Array.from(fromTee.sub)).toEqual(fromBytes.sub);
    expect(Array.from(fromTee.match)).toEqual(fromBytes.match);
    expect(fromTee.sub).toBe(sub);
    expect(fromTee.match).toBe(match);
  });

  // @gate enableFlightTee && enableTaint
  it('never shows SSR or the bytes a value a getter returns after it was read in DEV', async () => {
    const secret = 'secret-token-value';
    ReactServer.experimental_taintUniqueValue(
      'Cannot pass a secret token to the client',
      process,
      secret,
    );
    let reads = 0;
    const data = {
      get token() {
        return ++reads === 1 ? 'public' : secret;
      },
    };
    const {fromTee, fromBytes} = await readTeeAndBytes({data});
    if (__DEV__) {
      expect(fromTee.data.token).toBe('public');
      expect(fromBytes.data.token).toBe('public');
      expect(reads).toBe(2);
    } else {
      // A getter that answers differently per read isn't supported. In
      // production both outputs read it again.
      expect(fromTee.data).toBe(data);
    }
  });

  // @gate enableFlightTee
  it('dispatches hints and module preinits that arrive before the reader', async () => {
    function Client() {
      return React.createElement('span', null, 'client');
    }
    const ClientReference = clientExports(
      Client,
      'path/to/chunk.js',
      Promise.resolve(),
    );
    function App() {
      FlightReactDOM.preload('style.css', {as: 'style'});
      FlightReactDOM.preinit('script.js', {as: 'script'});
      return ReactServer.createElement(ClientReference);
    }
    const createModel = () => ReactServer.createElement(App);

    const fromBytes = await renderAfterFlight(createModel, false);
    const fromTee = await renderAfterFlight(createModel, true);
    expect(fromBytes).toContain('<link rel="preload" href="style.css"');
    expect(fromBytes).toContain('<script src="script.js" async="">');
    expect(fromBytes).toContain('<script src="/prefix/path/to/chunk.js"');
    // The same resources, but not in the same order. A flush writes import
    // rows before hint rows, and the tee gets rows in the order the server
    // emits them, so the chunk's preinit comes after the hints.
    const resources = html => html.match(/<(script|link)[^>]*>/g).sort();
    expect(resources(fromTee)).toEqual(resources(fromBytes));
    expect(fromTee.replace(/<(script|link)[^>]*>(<\/script>)?/g, '')).toBe(
      fromBytes.replace(/<(script|link)[^>]*>(<\/script>)?/g, ''),
    );
  });

  // @gate enableFlightTee
  it('dispatches hints that arrive after the reader in its context', async () => {
    let resolveLate;
    let late;
    async function Late() {
      await late;
      FlightReactDOM.preinit('late.js', {as: 'script'});
      return ReactServer.createElement('b', null, 'late');
    }
    function App() {
      FlightReactDOM.preload('early.css', {as: 'style'});
      return ReactServer.createElement(
        'div',
        null,
        ReactServer.createElement(
          ReactServer.Suspense,
          {fallback: 'loading'},
          ReactServer.createElement(Late),
        ),
      );
    }
    const createModel = () => ReactServer.createElement(App);

    async function render(useTee) {
      late = new Promise(resolve => {
        resolveLate = resolve;
      });
      let ssrStream;
      await serverAct(() => {
        const flight = startFlight(createModel(), useTee);
        ssrStream = ReactDOMServer.renderToPipeableStream(
          React.createElement(createClientRoot(flight)),
        );
      });
      const result = readResult(ssrStream);
      await serverAct(() => resolveLate());
      return result;
    }

    const fromBytes = await render(false);
    const fromTee = await render(true);
    expect(fromBytes).toContain('href="early.css"');
    // Reading the bytes in the same process, the late hint's row is parsed in
    // the stream's data event, which runs inside the Flight render's flush.
    // Fizz can't find its request there, so the hint is lost. The tee
    // dispatches it in the reader's context.
    expect(fromBytes).not.toContain('src="late.js"');
    if (gate(flags => flags.enableFlightTee)) {
      expect(fromTee).toBe(
        fromBytes.replace(
          '<div hidden id="S:0">',
          '<script src="late.js" async=""></script><div hidden id="S:0">',
        ),
      );
    } else {
      expect(fromTee).toBe(fromBytes);
    }
  });

  // @gate enableFlightTee
  it('does not show an AsyncLocalStorage store set in RSC to Client Components during SSR', async () => {
    const storage = new AsyncLocalStorage();
    const seen = [];
    function ReadStore({label}) {
      seen.push(label + ':' + String(storage.getStore()));
      return React.createElement('i', null, label);
    }
    const ReadStoreReference = clientExports(ReadStore);
    async function AsyncChild() {
      await Promise.resolve();
      return ReactServer.createElement(ReadStoreReference, {label: 'async'});
    }
    function App() {
      return ReactServer.createElement(
        'div',
        null,
        ReactServer.createElement(ReadStoreReference, {label: 'sync'}),
        ReactServer.createElement(
          ReactServer.Suspense,
          {fallback: 'loading'},
          ReactServer.createElement(AsyncChild),
        ),
      );
    }
    const createModel = () => ReactServer.createElement(App);

    async function render(useTee) {
      seen.length = 0;
      let ssrStream;
      await serverAct(() => {
        const flight = storage.run('rsc', () =>
          startFlight(createModel(), useTee),
        );
        ssrStream = storage.run('ssr', () =>
          ReactDOMServer.renderToPipeableStream(
            React.createElement(createClientRoot(flight)),
          ),
        );
      });
      const html = await readResult(ssrStream);
      return {html, seen: seen.slice().sort()};
    }

    const fromBytes = await render(false);
    const fromTee = await render(true);
    expect(fromBytes.seen).toEqual(['async:ssr', 'sync:ssr']);
    expect(fromTee).toEqual(fromBytes);
  });

  // @gate enableFlightTee
  it('errors pending rows when the render is aborted', async () => {
    async function Never() {
      await new Promise(() => {});
    }
    function App() {
      return ReactServer.createElement(
        'div',
        null,
        'ready',
        ReactServer.createElement(
          ReactServer.Suspense,
          {fallback: 'loading'},
          ReactServer.createElement(Never),
        ),
      );
    }

    async function render(useTee) {
      const errors = [];
      let flight;
      let ssrStream;
      await serverAct(() => {
        flight = startFlight(ReactServer.createElement(App), useTee, {
          flight: {
            onError(error) {
              return 'digest:' + error.message;
            },
          },
        });
        ssrStream = ReactDOMServer.renderToPipeableStream(
          React.createElement(createClientRoot(flight)),
          {
            onError(error, info) {
              errors.push(error.digest);
            },
          },
        );
      });
      const result = readResult(ssrStream);
      await serverAct(() => flight.flight.abort(new Error('stop')));
      // In DEV the message carries a stack that depends on where it was read.
      const html = (await result).replace(
        /\$RX\("B:0",.*<\/script>/,
        '$RX("B:0")</script>',
      );
      return {html, errors};
    }

    const fromBytes = await render(false);
    const fromTee = await render(true);
    expect(fromBytes.errors).toEqual(['digest:stop']);
    // The boundary errored after the shell, so a script marks it.
    expect(fromBytes.html).toContain('$RX("B:0"');
    expect(fromTee).toEqual(fromBytes);
  });

  // @gate enableFlightTee
  it('halts pending rows in an aborted prerender', async () => {
    async function Never() {
      await new Promise(() => {});
    }
    function App() {
      return ReactServer.createElement(
        'div',
        null,
        'ready',
        ReactServer.createElement(
          ReactServer.Suspense,
          {fallback: 'loading'},
          ReactServer.createElement(Never),
        ),
      );
    }

    async function prerender(useTee) {
      const flightController = new AbortController();
      const fizzController = new AbortController();
      const options = {unstable_allowPartialStream: true};
      let tee;
      let preludePromise;
      await serverAct(() => {
        tee = useTee
          ? ReactServerDOMClient.createTee(manifest(), options)
          : undefined;
        preludePromise = ReactServerDOMStaticServer.prerenderToNodeStream(
          ReactServer.createElement(App),
          turbopackMap,
          {signal: flightController.signal, tee, onError() {}},
        );
      });
      // Both renders are aborted at the same point, as in Next.js's staged
      // rendering.
      let response = null;
      let fizzPromise;
      function ClientRoot() {
        return React.use(response);
      }
      await serverAct(() => {
        if (useTee) {
          response = ReactServerDOMClient.createFromTee(tee);
          fizzPromise = ReactDOMFizzStatic.prerenderToNodeStream(
            React.createElement(ClientRoot),
            {signal: fizzController.signal, onError() {}},
          );
        }
      });
      await serverAct(() => {
        flightController.abort();
      });
      const {prelude: flightPrelude} = await preludePromise;
      if (!useTee) {
        response = ReactServerDOMClient.createFromNodeStream(
          flightPrelude,
          manifest(),
          options,
        );
        await serverAct(() => {
          fizzPromise = ReactDOMFizzStatic.prerenderToNodeStream(
            React.createElement(ClientRoot),
            {signal: fizzController.signal, onError() {}},
          );
        });
      }
      await serverAct(() => {
        fizzController.abort();
      });
      const {prelude} = await fizzPromise;
      return readResult(prelude);
    }

    const fromBytes = await prerender(false);
    const fromTee = await prerender(true);
    expect(fromBytes).toContain('ready');
    expect(fromBytes).toContain('loading');
    expect(fromBytes).not.toContain('<!--$!-->');
    expect(fromTee).toBe(fromBytes);
  });

  // @gate enableFlightTee
  it('closes when a halted prerender has emitted every row, before its prelude is read', async () => {
    const never = new Promise(() => {});
    async function read(useTee) {
      const controller = new AbortController();
      const tee = useTee
        ? ReactServerDOMClient.createTee(manifest())
        : undefined;
      let preludePromise;
      await serverAct(() => {
        preludePromise = ReactServerDOMStaticServer.prerenderToNodeStream(
          {ready: 'yes', later: never},
          turbopackMap,
          {signal: controller.signal, tee},
        );
      });
      await serverAct(() => controller.abort());
      const {prelude} = await preludePromise;
      // The tee's prelude is never read.
      const root = useTee
        ? ReactServerDOMClient.createFromTee(tee)
        : ReactServerDOMClient.createFromNodeStream(prelude, manifest());
      const value = await root;
      let reason = null;
      await serverAct(async () => {
        try {
          await value.later;
        } catch (error) {
          reason = error.message;
        }
      });
      return {ready: value.ready, reason};
    }
    const fromBytes = await read(false);
    const fromTee = await read(true);
    expect(fromBytes).toEqual({ready: 'yes', reason: 'Connection closed.'});
    expect(fromTee).toEqual(fromBytes);
  });

  // The tee builds every row as soon as the server emits it, while the bytes
  // only reach the reader when the destination is written. So Fizz can
  // resolve more before its first flush. This records what lands in a
  // prerender's shell when Fizz is aborted right after the Flight render's
  // first pass.
  // @gate enableFlightTee
  it('records what lands in a prerender shell', async () => {
    async function Child() {
      await Promise.resolve();
      return ReactServer.createElement('b', null, 'child');
    }
    function App() {
      return ReactServer.createElement(
        'div',
        null,
        ReactServer.createElement(
          ReactServer.Suspense,
          {fallback: 'loading'},
          ReactServer.createElement(Child),
        ),
      );
    }

    async function prerender(useTee) {
      const fizzController = new AbortController();
      let fizzPromise;
      await serverAct(() => {
        const flight = startFlight(ReactServer.createElement(App), useTee);
        fizzPromise = ReactDOMFizzStatic.prerenderToNodeStream(
          React.createElement(createClientRoot(flight)),
          {signal: fizzController.signal, onError() {}},
        );
        // Abort Fizz in the macrotask after the Flight render starts.
        setImmediate(() => fizzController.abort());
      });
      const {prelude} = await fizzPromise;
      return readResult(prelude);
    }

    const fromBytes = await prerender(false);
    const fromTee = await prerender(true);
    expect(fromBytes).toContain('child');
    expect(fromTee).toBe(fromBytes);
  });

  // @gate enableFlightTee
  it('can only be read once', async () => {
    const flight = startFlight({hello: 'world'}, true);
    expect(flight.read()).not.toBe(null);
    expect(() => ReactServerDOMClient.createFromTee(flight.tee)).toThrow(
      'A Flight tee can only be read once. Read any later copies from the stream.',
    );
    await serverAct(() => {});
  });

  // @gate enableFlightTee
  it('throws when the tee is passed to a second render', async () => {
    const tee = ReactServerDOMClient.createTee(manifest());
    await serverAct(() => {
      ReactServerDOMServer.renderToPipeableStream(
        {which: 'first'},
        turbopackMap,
        {
          tee,
        },
      ).pipe(new Stream.PassThrough());
    });
    expect(() =>
      ReactServerDOMServer.renderToPipeableStream(
        {which: 'second'},
        turbopackMap,
        {
          tee,
        },
      ),
    ).toThrow(
      'The tee is already being written to by another render. A tee can ' +
        'only be passed to one render.',
    );
    expect(await ReactServerDOMClient.createFromTee(tee)).toEqual({
      which: 'first',
    });
  });

  // @gate enableFlightTee
  it('throws when the tee is from another version', async () => {
    const tee = ReactServerDOMClient.createTee(manifest());
    tee._version = -1;
    // Another version's dispatcher can have different methods, so the server
    // checks the version before it reads the dispatcher.
    tee._dispatcher = null;
    expect(() =>
      ReactServerDOMServer.renderToPipeableStream({a: 1}, turbopackMap, {tee}),
    ).toThrow(
      'The tee was created by a different version of React than the one ' +
        'rendering. The Flight Client and Server must be the same version.',
    );
  });

  // @gate enableFlightTee
  it('throws when the tee is read before it is passed to a render', () => {
    const tee = ReactServerDOMClient.createTee(manifest());
    expect(() => ReactServerDOMClient.createFromTee(tee)).toThrow(
      'The tee has not been passed to a render. Pass it as the `tee` option ' +
        'of a Flight render before reading it.',
    );
  });

  // @gate enableFlightTee
  it('rejects the root when the render fails fatally', async () => {
    function App() {
      throw new Error('boom');
    }
    async function read(useTee) {
      let flight;
      let calls = 0;
      await serverAct(() => {
        flight = startFlight(ReactServer.createElement(App), useTee, {
          flight: {
            // Throwing from onError while handling a render error is a
            // fatal error. The fatal error is reported again, which passes.
            onError(error) {
              if (calls++ === 0) {
                throw new Error('fatal');
              }
            },
          },
        });
        flight.read();
      });
      try {
        await flight.read();
        return null;
      } catch (error) {
        return error.message;
      }
    }
    const fromBytes = await read(false);
    const fromTee = await read(true);
    expect(fromBytes).toBe('fatal');
    expect(fromTee).toBe(fromBytes);
  });

  // @gate enableFlightTee
  it('keeps _owner and _debugStack without a debug channel', async () => {
    function Parent() {
      return ReactServer.createElement('span', null, 'hi');
    }
    async function read(useTee) {
      let flight;
      await serverAct(() => {
        flight = startFlight({node: ReactServer.createElement(Parent)}, useTee);
        flight.read();
      });
      const root = await flight.read();
      const node = root.node;
      return {
        type: node.type,
        owner: __DEV__ ? node._owner && node._owner.name : undefined,
        hasStack: __DEV__ ? node._debugStack instanceof Error : undefined,
      };
    }
    const fromBytes = await read(false);
    const fromTee = await read(true);
    expect(fromBytes).toEqual(
      __DEV__
        ? {type: 'span', owner: 'Parent', hasStack: true}
        : {type: 'span', owner: undefined, hasStack: undefined},
    );
    expect(fromTee).toEqual(fromBytes);
  });

  // @gate enableFlightTee
  it('reads binary and large text rows', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const text = 'x'.repeat(2000);
    async function read(useTee) {
      let flight;
      await serverAct(() => {
        flight = startFlight(
          {bytes, ints: new Int32Array([7, 8]), text},
          useTee,
        );
        flight.read();
      });
      return flight.read();
    }
    const fromBytes = await read(false);
    const fromTee = await read(true);
    expect(fromTee).toEqual(fromBytes);
    expect(fromTee.bytes).not.toBe(bytes);
    expect(fromTee.bytes.buffer).not.toBe(bytes.buffer);
    fromTee.bytes[0] = 9;
    expect(bytes[0]).toBe(1);
  });
});
