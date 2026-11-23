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

jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightHTMLFirst: true,
  enableFlightTee: true,
}));

let clientExports;
let turbopackMap;
let turbopackModuleLoading;
let React;
let ReactDOMServer;
let ReactServer;
let ReactServerDOMServer;
let ReactServerDOMClient;
let Stream;
let serverAct;

// One render feeds SSR through a tee and the browser through its bytes. Each
// test reads the Ledger totals from both.
describe('ReactFlightTurbopackLedgers HTML-first Flight', () => {
  beforeEach(() => {
    jest.resetModules();
    patchSetImmediate();
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-turbopack/server', () =>
      require('react-server-dom-turbopack/server.node'),
    );
    ReactServer = require('react');
    ReactServerDOMServer = require('react-server-dom-turbopack/server');
    const TurbopackMock = require('./utils/TurbopackMock');
    clientExports = TurbopackMock.clientExports;
    turbopackMap = TurbopackMock.turbopackMap;
    turbopackModuleLoading = TurbopackMock.moduleLoading;

    jest.resetModules();
    __unmockReact();
    jest.unmock('react-server-dom-turbopack/server');
    jest.mock('react-server-dom-turbopack/client', () =>
      jest.requireActual('react-server-dom-turbopack/client.node'),
    );
    React = require('react');
    ReactDOMServer = require('react-dom/server.node');
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
      writable.on('error', reject);
      writable.on('end', () => resolve(buffer));
      stream.pipe(writable);
    });
  }

  function PageRoot({read}) {
    return React.use(read()).page;
  }

  // The server stubs an element only when it takes about 48 bytes or more in
  // the payload. A fixture appends this to its text to be stubbed.
  const FILL = ' filler text so this element is big enough to be stubbed';

  // Renders `createModel()` once. Returns the bytes, the model decoded from
  // them, and with `ssr` the HTML and the model that Fizz read from the tee.
  // With `htmlFirst`, the option is a thenable that settles when Fizz is done:
  // it resolves after allReady and rejects on an error. Without `ssr` nothing
  // renders HTML, so it resolves as soon as the render has started: the
  // bytes are all that is read, and the late rows for every stub follow.
  async function render(createModel, {htmlFirst, ssr = true, Root = PageRoot}) {
    let wire = '';
    let fromBytes;
    let fromTee = null;
    let html = null;
    let closed;
    let htmlDone = null;
    const htmlFirstOption = htmlFirst
      ? new Promise((resolve, reject) => {
          htmlDone = {resolve, reject};
        })
      : false;
    const wireClosed = new Promise(resolve => {
      closed = resolve;
    });
    await serverAct(async () => {
      const tee = ReactServerDOMClient.createTee(manifest());
      const readable = new Stream.PassThrough();
      const forClient = new Stream.PassThrough();
      readable.on('data', chunk => {
        wire += chunk.toString();
        forClient.write(chunk);
      });
      readable.on('end', () => {
        forClient.end();
        closed();
      });
      ReactServerDOMServer.renderToPipeableStream(createModel(), turbopackMap, {
        tee,
        htmlFirst: htmlFirstOption,
      }).pipe(readable);
      fromBytes = ReactServerDOMClient.createFromNodeStream(
        forClient,
        manifest(),
      );
      if (ssr) {
        const read = () => {
          if (fromTee === null) {
            fromTee = ReactServerDOMClient.createFromTee(tee);
          }
          return fromTee;
        };
        const fizz = ReactDOMServer.renderToPipeableStream(
          React.createElement(Root, {read}),
          {
            onAllReady() {
              if (htmlDone !== null) {
                htmlDone.resolve();
              }
            },
            onError(error) {
              if (htmlDone !== null) {
                htmlDone.reject(error);
              }
            },
          },
        );
        html = readResult(fizz);
      } else if (htmlDone !== null) {
        htmlDone.resolve();
      }
    });
    html = await html;
    await wireClosed;
    return {
      wire,
      html,
      bytes: await fromBytes,
      tee: fromTee === null ? null : await fromTee,
    };
  }

  async function sorted(total) {
    return Array.from(await total).sort();
  }

  function stubCount(wire) {
    const stubs = wire.match(/\$J[0-9a-f]+:/g);
    return stubs === null ? 0 : stubs.length;
  }

  function createPage() {
    const Tags = ReactServer.createSetLedger();
    const Dynamic = ReactServer.createBitLedger();
    function Card({tag}) {
      ReactServer.addToLedger(Tags, tag);
      return (
        <article>
          <h2>card {tag}</h2>
          <p>static body of {tag + FILL}</p>
        </article>
      );
    }
    async function Late() {
      await new Promise(resolve => setTimeout(resolve, 10));
      ReactServer.addToLedger(Tags, 'late');
      ReactServer.addToLedger(Dynamic, true);
      return <footer>late static{FILL}</footer>;
    }
    function Page() {
      return (
        <main>
          <Card tag="a" />
          <Card tag="b" />
          <Late />
        </main>
      );
    }
    const captured = ReactServer.captureLedgers(<Page />, [Tags, Dynamic]);
    return {
      tags: captured.ledgers[0],
      dynamic: captured.ledgers[1],
      page: captured.data,
    };
  }

  // @gate enableFlightLedgers
  it('resolves the same totals with and without stubs, from the bytes and from the tee', async () => {
    const off = await render(createPage, {htmlFirst: false});
    const on = await render(createPage, {htmlFirst: true});

    expect(stubCount(off.wire)).toBe(0);
    expect(stubCount(on.wire)).toBeGreaterThan(0);
    expect(on.wire).not.toContain('static body of');
    expect(on.html).toBe(off.html);
    expect(on.html).toContain('static body of');

    const models = [off.bytes, off.tee, on.bytes, on.tee];
    for (let i = 0; i < models.length; i++) {
      expect(await sorted(models[i].tags)).toEqual(['a', 'b', 'late']);
      expect(await models[i].dynamic).toBe(true);
    }
  });

  // The totals resolve when the tee closes. The stream stays open for late
  // rows until the reader has rendered, so one must not wait on the other.
  // @gate enableFlightLedgers
  it('lets the HTML wait on a total while the stream is held for late rows', async () => {
    function Root({read}) {
      const model = React.use(read());
      const tags = React.use(model.tags);
      return (
        <div data-tags={Array.from(tags).sort().join(',')}>{model.page}</div>
      );
    }
    const {html, wire, bytes} = await render(createPage, {
      htmlFirst: true,
      Root,
    });
    expect(stubCount(wire)).toBeGreaterThan(0);
    expect(html).toContain('data-tags="a,b,late"');
    expect(html).toContain('static body of');
    expect(wire).not.toContain('static body of');
    expect(await sorted(bytes.tags)).toEqual(['a', 'b', 'late']);
  });

  // @gate enableFlightLedgers
  it('credits a cached write to every capture that hits it when its output is stubbed', async () => {
    function createModel() {
      const Tags = ReactServer.createSetLedger();
      const getCard = ReactServer.cache(() => {
        ReactServer.addToLedger(Tags, 'cached');
        return (
          <article>
            <p>cached static{FILL}</p>
          </article>
        );
      });
      function First() {
        return getCard();
      }
      function Second() {
        return getCard();
      }
      const first = ReactServer.captureLedgers(<First />, [Tags]);
      const second = ReactServer.captureLedgers(<Second />, [Tags]);
      const bare = ReactServer.captureLedgers(
        <aside key="bare">bare static{FILL}</aside>,
        [Tags],
      );
      return {
        first: first.ledgers[0],
        second: second.ledgers[0],
        bare: bare.ledgers[0],
        page: (
          <main>
            {first.data}
            {second.data}
            {bare.data}
          </main>
        ),
      };
    }
    const off = await render(createModel, {htmlFirst: false});
    const on = await render(createModel, {htmlFirst: true});
    expect(stubCount(off.wire)).toBe(0);
    expect(stubCount(on.wire)).toBeGreaterThan(0);
    expect(on.html).toBe(off.html);
    expect(on.wire).not.toContain('cached static');
    expect(on.wire).not.toContain('bare static');

    const models = [off.bytes, off.tee, on.bytes, on.tee];
    for (let i = 0; i < models.length; i++) {
      expect(await sorted(models[i].first)).toEqual(['cached']);
      expect(await sorted(models[i].second)).toEqual(['cached']);
      expect(await sorted(models[i].bare)).toEqual([]);
    }
  });

  // Without stubs, the second position is a reference to the row that wrote
  // the element first, and a reference credits everything that row's unit
  // wrote, including the write beside the element. A stub isn't a reference to
  // a row, and a stubbed element has no component inside it that could write,
  // so there is nothing to credit: the over-report is gone, and nothing is
  // under-reported.
  // @gate enableFlightLedgers
  it('does not credit a capture that reuses a stubbed element with the writes beside it', async () => {
    function createModel() {
      const Tags = ReactServer.createSetLedger();
      function Child({el}) {
        return el;
      }
      function Parent() {
        ReactServer.addToLedger(Tags, 'beside');
        const el = <p key="p">static{FILL}</p>;
        const captured = ReactServer.captureLedgers(<Child el={el} />, [Tags]);
        return {
          page: (
            <main>
              {el}
              <section key="s">{captured.data}</section>
            </main>
          ),
          child: captured.ledgers[0],
        };
      }
      return <Parent />;
    }
    const off = await render(createModel, {htmlFirst: false});
    const on = await render(createModel, {htmlFirst: true});
    expect(stubCount(off.wire)).toBe(0);
    expect(stubCount(on.wire)).toBeGreaterThan(0);
    expect(on.html).toBe(off.html);
    expect(await sorted(off.bytes.child)).toEqual(['beside']);
    expect(await sorted(off.tee.child)).toEqual(['beside']);
    expect(await sorted(on.bytes.child)).toEqual([]);
    expect(await sorted(on.tee.child)).toEqual([]);
  });

  // @gate enableFlightLedgers
  it('closes the totals after the late rows of stubs that the HTML did not render', async () => {
    function createModel() {
      const Tags = ReactServer.createSetLedger();
      const Hidden = clientExports(function Hidden() {
        return null;
      });
      function Page() {
        ReactServer.addToLedger(Tags, 'page');
        return (
          <main>
            <h1>shown static{FILL}</h1>
            <Hidden>
              <div>
                <p>hidden static{FILL}</p>
              </div>
            </Hidden>
          </main>
        );
      }
      const captured = ReactServer.captureLedgers(<Page />, [Tags]);
      return {tags: captured.ledgers[0], page: captured.data};
    }
    const {html, wire, bytes, tee} = await render(createModel, {
      htmlFirst: true,
    });
    expect(stubCount(wire)).toBeGreaterThan(0);
    expect(html).toContain('shown static');
    expect(html).not.toContain('hidden static');
    expect(wire).not.toContain('shown static');
    // The late row.
    expect(wire).toContain('hidden static');
    expect(await sorted(bytes.tags)).toEqual(['page']);
    expect(await sorted(tee.tags)).toEqual(['page']);
  });

  // @gate enableFlightLedgers
  it('resolves the totals from the bytes when the tee is never read', async () => {
    const {wire, bytes} = await render(createPage, {
      htmlFirst: true,
      ssr: false,
    });
    expect(stubCount(wire)).toBeGreaterThan(0);
    expect(await sorted(bytes.tags)).toEqual(['a', 'b', 'late']);
    expect(await bytes.dynamic).toBe(true);
  });
});
