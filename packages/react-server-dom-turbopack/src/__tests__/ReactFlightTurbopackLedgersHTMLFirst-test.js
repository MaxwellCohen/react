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

// SSR claims the stubbed rows of a render by reading its bytes, and the
// browser decodes the same bytes without them. Each test reads the Ledger
// totals from both.
// The server stubs an element only when it has 8 host nodes, or when it takes
// 512 bytes or more in the payload. A fixture adds this to be stubbed.
const FILL = ' filler text so this element is big enough to be stubbed'.repeat(
  10,
);

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

  // Renders `createModel()` once. With `ssr`, Fizz reads the bytes while they
  // stream, which claims the stubbed rows. Returns the bytes, the HTML, the
  // model SSR decoded, and the model a second decode of the bytes gives, as
  // in the browser.
  async function render(createModel, {htmlFirst, ssr = true, Root = PageRoot}) {
    let wire = '';
    let fromSSR = null;
    let html = null;
    let closed;
    const wireClosed = new Promise(resolve => {
      closed = resolve;
    });
    await serverAct(async () => {
      const readable = new Stream.PassThrough();
      const forSSR = new Stream.PassThrough();
      readable.on('data', chunk => {
        wire += chunk.toString();
        forSSR.write(chunk);
      });
      readable.on('end', () => {
        forSSR.end();
        closed();
      });
      ReactServerDOMServer.renderToPipeableStream(createModel(), turbopackMap, {
        htmlFirst,
      }).pipe(readable);
      if (ssr) {
        const read = () => {
          if (fromSSR === null) {
            fromSSR = ReactServerDOMClient.createFromNodeStream(
              forSSR,
              manifest(),
            );
          }
          return fromSSR;
        };
        html = readResult(
          ReactDOMServer.renderToPipeableStream(
            React.createElement(Root, {read}),
          ),
        );
      }
    });
    html = await html;
    await wireClosed;
    const again = new Stream.PassThrough();
    const fromBytes = ReactServerDOMClient.createFromNodeStream(
      again,
      manifest(),
    );
    again.end(wire);
    return {
      wire,
      // Fizz writes <!--J…--> stub markers only when htmlFirst is on.
      html: html === null ? null : html.replace(/<!--J[0-9a-z.:]+-->/g, ''),
      bytes: await fromBytes,
      ssr: fromSSR === null ? null : await fromSSR,
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
        <article data-fill={FILL}>
          <h2>card {tag}</h2>
          <p>static body of {tag}</p>
        </article>
      );
    }
    async function Late() {
      await new Promise(resolve => setTimeout(resolve, 10));
      ReactServer.addToLedger(Tags, 'late');
      ReactServer.addToLedger(Dynamic, true);
      return <footer data-fill={FILL}>late static</footer>;
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
  it('resolves the same totals with and without stubs, in SSR and in the browser', async () => {
    const off = await render(createPage, {htmlFirst: false});
    const on = await render(createPage, {htmlFirst: true});

    expect(stubCount(off.wire)).toBe(0);
    expect(stubCount(on.wire)).toBeGreaterThan(0);
    expect(on.wire).not.toContain('static body of');
    expect(on.html).toBe(off.html);
    expect(on.html).toContain('static body of');

    const models = [off.bytes, off.ssr, on.bytes, on.ssr];
    for (let i = 0; i < models.length; i++) {
      expect(await sorted(models[i].tags)).toEqual(['a', 'b', 'late']);
      expect(await models[i].dynamic).toBe(true);
    }
  });

  // The totals resolve when the stream closes, and the stream stays open for
  // late rows until SSR has rendered, so one must not wait on the other.
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
          <article data-fill={FILL}>
            <p>cached static</p>
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
        <aside key="bare" data-fill={FILL}>
          bare static
        </aside>,
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
    expect(on.html).toBe(off.html);
    expect(on.wire).not.toContain('cached static');
    expect(on.wire).not.toContain('bare static');

    const models = [off.bytes, off.ssr, on.bytes, on.ssr];
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
        const el = (
          <p key="p" data-fill={FILL}>
            static
          </p>
        );
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
    expect(on.html).toBe(off.html);
    expect(await sorted(off.bytes.child)).toEqual(['beside']);
    expect(await sorted(off.ssr.child)).toEqual(['beside']);
    expect(await sorted(on.bytes.child)).toEqual([]);
    expect(await sorted(on.ssr.child)).toEqual([]);
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
            <h1 data-fill={FILL}>shown static</h1>
            <Hidden>
              <p data-fill={FILL}>hidden static</p>
            </Hidden>
          </main>
        );
      }
      const captured = ReactServer.captureLedgers(<Page />, [Tags]);
      return {tags: captured.ledgers[0], page: captured.data};
    }
    const {html, wire, bytes, ssr} = await render(createModel, {
      htmlFirst: true,
    });
    expect(html).toContain('shown static');
    expect(html).not.toContain('hidden static');
    expect(wire).not.toContain('shown static');
    // The late row.
    expect(wire).toContain('hidden static');
    expect(await sorted(bytes.tags)).toEqual(['page']);
    expect(await sorted(ssr.tags)).toEqual(['page']);
  });

  // @gate enableFlightLedgers
  it('resolves the totals from the bytes when nothing claims the stubbed rows', async () => {
    const {wire, bytes} = await render(createPage, {
      htmlFirst: true,
      ssr: false,
    });
    expect(stubCount(wire)).toBeGreaterThan(0);
    expect(await sorted(bytes.tags)).toEqual(['a', 'b', 'late']);
    expect(await bytes.dynamic).toBe(true);
  });
});
