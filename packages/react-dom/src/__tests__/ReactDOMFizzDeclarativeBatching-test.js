/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment ./scripts/jest/ReactDOMServerIntegrationEnvironment
 */

'use strict';

// Run the whole file with enableFizzDeclarativePatching turned on.
jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFizzDeclarativePatching: true,
}));

// Declarative patching has no client runtime to coordinate reveals, so the server holds
// completed boundaries for a batch window and writes them together. These tests drive a
// fake clock and capture the stream chunk by chunk to check grouping and ordering.

let Stream;
let React;
let ReactDOMFizzServer;
let Suspense;
let SuspenseList;
let act;
let textCache;
let now;
let timers;
let realSetTimeout;

describe('ReactDOMFizzServer declarative patching batching', () => {
  beforeEach(() => {
    jest.resetModules();
    Stream = require('stream');
    React = require('react');
    ReactDOMFizzServer = require('react-dom/server');
    Suspense = React.Suspense;
    if (gate(flags => flags.enableSuspenseList)) {
      SuspenseList = React.unstable_SuspenseList;
    }
    act = require('internal-test-utils').act;
    textCache = new Map();

    // Controlled clock and batch timers. Only timers with a delay are ours; the
    // scheduler and act use setImmediate/MessageChannel or a zero delay.
    now = 1000;
    timers = [];
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    realSetTimeout = global.setTimeout;
    global.setTimeout = jest.fn((callback, ms, ...args) => {
      if (typeof ms === 'number' && ms > 0 && ms <= 3000) {
        timers.push({callback, at: now + ms});
        return 0;
      }
      return realSetTimeout(callback, ms, ...args);
    });
  });

  afterEach(() => {
    global.setTimeout = realSetTimeout;
    jest.restoreAllMocks();
  });

  async function advance(ms) {
    now += ms;
    const due = timers.filter(t => t.at <= now);
    timers = timers.filter(t => t.at > now);
    await act(async () => {
      due.forEach(t => t.callback());
    });
  }

  function resolveText(text) {
    const record = textCache.get(text);
    if (record === undefined) {
      textCache.set(text, {status: 'resolved', value: text});
    } else if (record.status === 'pending') {
      const thenable = record.value;
      record.status = 'resolved';
      record.value = text;
      thenable.pings.forEach(t => t());
    }
  }

  function readText(text) {
    const record = textCache.get(text);
    if (record !== undefined) {
      if (record.status === 'resolved') {
        return record.value;
      }
      throw record.value;
    }
    const thenable = {
      pings: [],
      then(resolve) {
        if (newRecord.status === 'pending') {
          thenable.pings.push(resolve);
        } else {
          Promise.resolve().then(() => resolve(newRecord.value));
        }
      },
    };
    const newRecord = {status: 'pending', value: thenable};
    textCache.set(text, newRecord);
    throw thenable;
  }

  function Text({text}) {
    return <p id={text}>{readText(text)}</p>;
  }

  function boundaries(names) {
    return names.map(name => (
      <Suspense key={name} fallback={<i>{'loading ' + name}</i>}>
        <Text text={name} />
      </Suspense>
    ));
  }

  // Renders and returns {chunks, resolve, text}. `chunks` has one entry per write the
  // sink saw, so patches that were flushed together share an entry.
  async function render(element, options) {
    const writable = new Stream.PassThrough();
    writable.setEncoding('utf8');
    const chunks = [];
    writable.on('data', chunk => {
      chunks.push(chunk);
    });
    await act(async () => {
      ReactDOMFizzServer.renderToPipeableStream(element, {
        unstable_declarativePatching: true,
        ...options,
      }).pipe(writable);
    });
    return {
      chunks,
      text: () => chunks.join(''),
      async resolve(...names) {
        await act(async () => {
          names.forEach(resolveText);
        });
        await act(async () => {});
      },
    };
  }

  const patchIds = text =>
    (text.match(/<template for="B:[0-9a-f]+">/g) || []).map(m =>
      m.slice('<template for="B:'.length, -2),
    );

  // Chunks (after the shell) that contain patches, as lists of boundary ids.
  const patchGroups = r =>
    r.chunks.map(c => patchIds(c)).filter(ids => ids.length > 0);

  it('holds completions for the window and writes them as one group', async () => {
    const r = await render(
      <html>
        <body>{boundaries(['a', 'b', 'c', 'd', 'e', 'f'])}</body>
      </html>,
    );
    expect(patchGroups(r)).toEqual([]);

    // Inside the first frame nothing is written yet; after it one group goes out.
    await r.resolve('a', 'b');
    await r.resolve('c');
    expect(patchGroups(r)).toEqual([]);
    await advance(16);
    expect(patchGroups(r)).toEqual([['0', '1', '2']]);

    // The next window opens FALLBACK_THROTTLE_MS (300) after that flush.
    await r.resolve('d');
    await advance(100);
    await r.resolve('e', 'f');
    await advance(100);
    expect(patchGroups(r)).toEqual([['0', '1', '2']]);
    await advance(100);
    expect(patchGroups(r)).toEqual([
      ['0', '1', '2'],
      ['3', '4', '5'],
    ]);
    expect(r.text()).not.toContain('$RC');
  });

  it('does not reveal a boundary that only completed partially', async () => {
    // The first piece of content completes after the fallback was flushed, while another
    // piece is still pending. The script path stages that in a hidden container; a patch
    // is applied as soon as it is parsed, so it has to wait for the whole boundary.
    function Wrapper() {
      readText('w');
      return (
        <div id="wrapper">
          <Text text="a" />
          <Text text="b" />
        </div>
      );
    }
    const r = await render(
      <html>
        <body>
          <Suspense fallback={<i>loading</i>}>
            <Wrapper />
          </Suspense>
        </body>
      </html>,
      {unstable_declarativeBatchMs: 0},
    );
    await r.resolve('w');
    await r.resolve('a');
    expect(patchGroups(r)).toEqual([]);
    expect(r.text()).not.toContain('<p id="a">');
    await r.resolve('b');
    expect(patchGroups(r)).toEqual([['0']]);
    const out = r.text();
    expect(out).toContain('<p id="a">a</p><p id="b">b</p>');
    // Everything is inline in the one patch: no placeholders or segment instructions.
    expect(out).not.toContain('<template id="P:');
    expect(out).not.toContain('$RS');
  });

  it('throttles from the first frame for completions that miss it, like $RT', async () => {
    const r = await render(
      <html>
        <body>{boundaries(['a', 'b'])}</body>
      </html>,
    );
    // The shell was written at t=1000. Its first frame is at about 1016. A completion at
    // 1100 missed it, so it is revealed at 1016 + FALLBACK_THROTTLE_MS.
    now = 1100;
    await r.resolve('a');
    await advance(200);
    expect(patchGroups(r)).toEqual([]);
    await advance(16);
    expect(patchGroups(r)).toEqual([['0']]);
  });

  it('does not hold when the batch window is 0, but still groups a flush', async () => {
    const r = await render(
      <html>
        <body>{boundaries(['a', 'b', 'c'])}</body>
      </html>,
      {unstable_declarativeBatchMs: 0},
    );
    await r.resolve('a');
    expect(patchGroups(r)).toEqual([['0']]);
    await r.resolve('b');
    expect(patchGroups(r)).toEqual([['0'], ['1']]);
    expect(timers).toEqual([]);
  });

  it('shortens a throttle that would miss the vanity metric', async () => {
    const r = await render(
      <html>
        <body>{boundaries(['a', 'b'])}</body>
      </html>,
    );
    await r.resolve('a');
    await advance(16);
    expect(patchGroups(r)).toEqual([['0']]);
    // 2100ms after the request started: the usual wait would end at 2316ms, the
    // vanity metric target (2300ms) is earlier.
    now = 1000 + 2100;
    await r.resolve('b');
    await advance(199);
    expect(patchGroups(r)).toEqual([['0']]);
    await advance(1);
    expect(patchGroups(r)).toEqual([['0'], ['1']]);
  });

  it('keeps the reveal throttle constants in sync with the client runtime', () => {
    const fs = require('fs');
    const path = require('path');
    const shared = fs.readFileSync(
      path.join(
        __dirname,
        '../../../react-dom-bindings/src/server/fizz-instruction-set/ReactDOMFizzInstructionSetShared.js',
      ),
      'utf8',
    );
    const config = fs.readFileSync(
      path.join(
        __dirname,
        '../../../react-dom-bindings/src/server/ReactFizzConfigDOM.js',
      ),
      'utf8',
    );
    const pick = (src, re) => +re.exec(src)[1];
    expect(pick(config, /DECLARATIVE_FALLBACK_THROTTLE_MS = (\d+)/)).toBe(
      pick(shared, /const FALLBACK_THROTTLE_MS = (\d+)/),
    );
    expect(pick(config, /DECLARATIVE_TARGET_VANITY_METRIC = (\d+)/)).toBe(
      pick(shared, /const TARGET_VANITY_METRIC = (\d+)/),
    );
  });

  it('writes a parent patch before the patches of boundaries nested in it', async () => {
    function Nested() {
      return (
        <div id="outer">
          {readText('outer')}
          <Suspense fallback={<i>loading inner</i>}>
            <Text text="inner" />
          </Suspense>
        </div>
      );
    }
    const r = await render(
      <html>
        <body>
          <Suspense fallback={<i>loading outer</i>}>
            <Nested />
          </Suspense>
        </body>
      </html>,
    );
    // The inner boundary can only be revealed once the outer one is in the document.
    await r.resolve('outer');
    await advance(16);
    expect(patchGroups(r)).toEqual([['0']]);
    // The outer patch carries the still pending inner boundary as a range.
    expect(r.text()).toMatch(/<template for="B:0">[^]*<\?start name="B:1">/);

    await r.resolve('inner');
    await advance(300);
    expect(patchGroups(r)).toEqual([['0'], ['1']]);
    expect(r.text().indexOf('<template for="B:0">')).toBeLessThan(
      r.text().indexOf('<template for="B:1">'),
    );
  });

  it('keeps parent-before-child order inside one group when the child is outlined', async () => {
    const big = 'x'.repeat(2000);
    function Nested() {
      return (
        <div id="outer">
          {readText('outer')}
          <Suspense fallback={<i>loading inner</i>}>
            <Text text="inner" />
            <p>{big}</p>
          </Suspense>
        </div>
      );
    }
    const r = await render(
      <html>
        <body>
          <Suspense fallback={<i>loading outer</i>}>
            <Nested />
          </Suspense>
        </body>
      </html>,
      // Small enough that the completed inner boundary is outlined instead of inlined.
      {progressiveChunkSize: 100},
    );
    await r.resolve('inner');
    await r.resolve('outer');
    await advance(16);
    const groups = patchGroups(r);
    // Both patches were written in the same flush, outer first.
    expect(groups).toEqual([['0', '1']]);
  });

  // @gate enableSuspenseList
  it('reveals a "together" SuspenseList as one group without falling back to scripts', async () => {
    const r = await render(
      <html>
        <body>
          <SuspenseList revealOrder="together">
            {boundaries(['a', 'b', 'c'])}
          </SuspenseList>
        </body>
      </html>,
      {unstable_declarativeBatchMs: 0},
    );
    // The row stays unrevealed until every boundary in it is done.
    await r.resolve('a');
    await r.resolve('c');
    expect(patchGroups(r)).toEqual([]);
    await r.resolve('b');
    expect(patchGroups(r)).toEqual([['0', '1', '2']]);
    expect(r.text()).not.toContain('$RC');
    expect(r.text()).not.toContain('<template id="B:');
    expect(r.text().match(/<\?start/g).length).toBe(3);
  });

  // @gate enableSuspenseList
  it('keeps "together" rows together when the batch window holds them', async () => {
    const r = await render(
      <html>
        <body>
          <SuspenseList revealOrder="together">
            {boundaries(['a', 'b', 'c'])}
          </SuspenseList>
        </body>
      </html>,
    );
    await r.resolve('a', 'b');
    await advance(300);
    expect(patchGroups(r)).toEqual([]);
    await r.resolve('c');
    await advance(300);
    expect(patchGroups(r)).toEqual([['0', '1', '2']]);
  });

  // The ids of revealed boundaries, in the order the document is told to reveal them.
  const revealedIds = text =>
    (text.match(/\$RC\("B:[0-9a-f]+"|<template for="B:[0-9a-f]+">/g) || []).map(
      m => /B:([0-9a-f]+)/.exec(m)[1],
    );

  ['forwards', 'backwards'].forEach(revealOrder => {
    // @gate enableSuspenseList
    it(`reveals "${revealOrder}" lists in the same order as the script path`, async () => {
      async function run(declarative, steps) {
        textCache = new Map();
        const r = await render(
          <html>
            <body>
              <SuspenseList revealOrder={revealOrder}>
                {boundaries(['a', 'b', 'c'])}
              </SuspenseList>
            </body>
          </html>,
          {unstable_declarativePatching: declarative},
        );
        const seen = [];
        for (let i = 0; i < steps.length; i++) {
          await r.resolve(...steps[i]);
          await advance(300);
          seen.push(revealedIds(r.text()));
        }
        return {seen, r};
      }
      const steps = [['c'], ['b'], ['a']];
      const script = await run(false, steps);
      const decl = await run(true, steps);
      // The declarative run really used patches (and the script run did not).
      expect(decl.r.text()).toContain('<template for="B:');
      expect(script.r.text()).not.toContain('<template for="B:');
      // Same boundaries revealed in the same order after every step.
      expect(decl.seen).toEqual(script.seen);
      expect(decl.seen[2].length).toBe(3);
      // A patch group per window, never one window per row.
      expect(patchGroups(decl.r).length).toBeLessThanOrEqual(2);
    });
  });

  // @gate enableSuspenseList
  it('keeps "forwards" rows waiting for earlier rows without spending a window each', async () => {
    const r = await render(
      <html>
        <body>
          <SuspenseList revealOrder="forwards">
            {boundaries(['a', 'b', 'c'])}
          </SuspenseList>
        </body>
      </html>,
    );
    await r.resolve('c', 'b');
    await advance(300);
    expect(patchGroups(r)).toEqual([]);
    await r.resolve('a');
    await advance(300);
    expect(patchGroups(r)).toEqual([['0', '1', '2']]);
  });

  it('signals an errored boundary right away, without a script and without holding', async () => {
    function Boom() {
      readText('boom');
      throw new Error('boom');
    }
    const r = await render(
      <html>
        <body>
          <Suspense fallback={<i>loading</i>}>
            <Boom />
          </Suspense>
          {boundaries(['a'])}
        </body>
      </html>,
      {onError: () => 'digest-1'},
    );
    await r.resolve('boom');
    // No advance(): $RX is not throttled either.
    expect(r.text()).toContain(
      '<template data-rcr id="E:B:0" data-dgst="digest-1"',
    );
    expect(r.text()).not.toContain('$RX');
    expect(r.text()).not.toContain('<script');
    // The fallback range is untouched and a later completion still patches normally.
    expect(r.text()).toContain('<?start name="B:0"><i>loading</i><?end>');
    await r.resolve('a');
    await advance(300);
    expect(patchGroups(r)).toEqual([['1']]);
  });

  it('flushes held patches immediately on abort', async () => {
    const writable = new Stream.PassThrough();
    writable.setEncoding('utf8');
    const chunks = [];
    writable.on('data', chunk => chunks.push(chunk));
    let abort;
    await act(async () => {
      const stream = ReactDOMFizzServer.renderToPipeableStream(
        <html>
          <body>{boundaries(['a', 'b'])}</body>
        </html>,
        {unstable_declarativePatching: true},
      );
      abort = stream.abort;
      stream.pipe(writable);
    });
    await act(async () => {
      resolveText('a');
    });
    await advance(16);
    expect(chunks.join('')).toContain('<template for="B:0">');
    await act(async () => {
      resolveText('b');
    });
    expect(chunks.join('')).not.toContain('<template for="B:1">');
    await act(async () => {
      abort();
    });
    expect(chunks.join('')).toContain('<template for="B:1">');
    expect(writable.writableEnded).toBe(true);
  });
});
