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

// jsdom has no support for <?start>/<?end> markers or <template for>. These tests assert
// the emitted markup, and simulate what a supporting browser's parser does to exercise the
// client hydration path. The real parser behavior is NOT verified here.

let JSDOM;
let Stream;
let React;
let ReactDOMClient;
let ReactDOMFizzServer;
let Suspense;
let act;
let textCache;

const BOUNDARIES = 250;

describe('ReactDOMFizzServer declarative patching', () => {
  beforeEach(() => {
    jest.resetModules();
    JSDOM = require('jsdom').JSDOM;
    const jsdom = new JSDOM(
      '<!DOCTYPE html><html><head></head><body><div id="container"></div></body></html>',
    );
    global.window = jsdom.window;
    global.document = jsdom.window.document;
    global.navigator = jsdom.window.navigator;
    global.Node = jsdom.window.Node;
    global.MutationObserver = jsdom.window.MutationObserver;
    global.requestAnimationFrame = jsdom.window.requestAnimationFrame = cb =>
      setTimeout(cb);

    Stream = require('stream');
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactDOMFizzServer = require('react-dom/server');
    Suspense = React.Suspense;
    act = require('internal-test-utils').act;
    textCache = new Map();
  });

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

  function Item({i, onClick}) {
    return (
      <p className="item" onClick={onClick}>
        {readText('item-' + i)}
      </p>
    );
  }

  function App({count, onClick}) {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push(
        <Suspense key={i} fallback={<span className="fb">Loading</span>}>
          <Item i={i} onClick={onClick} />
        </Suspense>,
      );
    }
    return <div id="app">{items}</div>;
  }

  // Renders and returns everything that was streamed, as a string. Boundaries resolve
  // after the shell has flushed so each one is streamed as a completion.
  async function render(element, options) {
    const writable = new Stream.PassThrough();
    writable.setEncoding('utf8');
    let out = '';
    writable.on('data', chunk => {
      out += chunk;
    });
    let pipe;
    await act(async () => {
      pipe = ReactDOMFizzServer.renderToPipeableStream(element, options).pipe;
      pipe(writable);
    });
    return {
      shell: () => out,
      async finish(texts) {
        await act(async () => {
          texts.forEach(resolveText);
        });
        await act(async () => {
          // Let the stream drain.
        });
        return out;
      },
    };
  }

  function allTexts(count) {
    const texts = [];
    for (let i = 0; i < count; i++) {
      texts.push('item-' + i);
    }
    return texts;
  }

  function occurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
  }

  const byteLength = str => Buffer.byteLength(str, 'utf8');

  it('streams boundary-heavy trees as scripts by default', async () => {
    const r = await render(<App count={BOUNDARIES} />);
    const out = await r.finish(allTexts(BOUNDARIES));
    expect(occurrences(out, '<template for=')).toBe(0);
    expect(occurrences(out, '<?start')).toBe(0);
    expect(occurrences(out, '$RC("B:')).toBe(BOUNDARIES);
    expect(occurrences(out, '<template id="B:')).toBe(BOUNDARIES);
  });

  it('emits <?start> ranges and <template for> patches without scripts', async () => {
    const r = await render(<App count={BOUNDARIES} />, {
      unstable_declarativePatching: true,
    });
    const shell = r.shell();
    // The comment markers stay outside of the range so React keeps a stable node.
    expect(occurrences(shell, '<!--$?--><?start name="B:')).toBe(BOUNDARIES);
    expect(occurrences(shell, '<?end><!--/$-->')).toBe(BOUNDARIES);
    expect(shell).not.toContain('<template id="B:');

    const out = await r.finish(allTexts(BOUNDARIES));
    expect(occurrences(out, '<template for="B:')).toBe(BOUNDARIES);
    expect(out).toContain(
      '<template for="B:0"><p class="item">item-0</p></template>',
    );
    expect(out).not.toContain('$RC');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<div hidden id="S:');
  });

  it('is smaller than the script path for 250 boundaries', async () => {
    const scriptRun = await render(<App count={BOUNDARIES} />);
    const scriptOut = await scriptRun.finish(allTexts(BOUNDARIES));

    jest.resetModules();
    textCache = new Map();
    React = require('react');
    ReactDOMFizzServer = require('react-dom/server');
    Suspense = React.Suspense;
    act = require('internal-test-utils').act;
    Stream = require('stream');

    const declRun = await render(<App count={BOUNDARIES} />, {
      unstable_declarativePatching: true,
    });
    const declOut = await declRun.finish(allTexts(BOUNDARIES));

    const scriptBytes = byteLength(scriptOut);
    const declBytes = byteLength(declOut);
    // Nonces make the script path grow further since every <script> carries one.
    expect(declBytes).toBeLessThan(scriptBytes);
    // Sanity check that this is a meaningful win and not noise: the $RC function body
    // alone is hundreds of bytes and every boundary saves its wrapper + script tag.
    expect(scriptBytes - declBytes).toBeGreaterThan(BOUNDARIES * 30);
    if (process.env.REPORT_FIZZ_BYTES) {
      console.log(
        JSON.stringify({BOUNDARIES, scriptBytes, declBytes}, null, 2),
      );
    }
  });

  it('needs no nonce for streamed completions', async () => {
    const nonce = 'abc123';
    const scriptRun = await render(<App count={10} />, {nonce});
    const scriptOut = await scriptRun.finish(allTexts(10));
    expect(occurrences(scriptOut, 'nonce="abc123"')).toBeGreaterThanOrEqual(10);

    jest.resetModules();
    textCache = new Map();
    React = require('react');
    ReactDOMFizzServer = require('react-dom/server');
    Suspense = React.Suspense;
    act = require('internal-test-utils').act;
    Stream = require('stream');

    const declRun = await render(<App count={10} />, {
      nonce,
      unstable_declarativePatching: true,
    });
    const declOut = await declRun.finish(allTexts(10));
    expect(declOut).not.toContain('nonce=');
  });

  it('falls back to the script path inside SVG', async () => {
    function SvgApp() {
      return (
        <svg>
          <Suspense fallback={<circle r="1" />}>
            <Circle />
          </Suspense>
        </svg>
      );
    }
    function Circle() {
      readText('svg');
      return <circle r="2" />;
    }
    const r = await render(<SvgApp />, {unstable_declarativePatching: true});
    const out = await r.finish(['svg']);
    expect(out).not.toContain('<template for=');
    expect(out).toContain('<template id="B:0"></template>');
    expect(out).toContain('$RC("B:0","S:0")');
  });

  it('keeps nested pending boundaries patchable', async () => {
    function Outer() {
      readText('outer');
      return (
        <section>
          <Suspense fallback="inner-fallback">
            <Inner />
          </Suspense>
        </section>
      );
    }
    function Inner() {
      return readText('inner');
    }
    const r = await render(
      <div>
        <Suspense fallback="outer-fallback">
          <Outer />
        </Suspense>
      </div>,
      {unstable_declarativePatching: true},
    );
    const afterOuter = await r.finish(['outer']);
    // The outer patch carries a new range for the inner boundary to patch later.
    expect(afterOuter).toMatch(
      /<template for="B:0"><section><!--\$\?--><\?start name="B:1">inner-fallback<\?end><!--\/\$--><\/section><\/template>/,
    );
    const afterInner = await r.finish(['inner']);
    expect(afterInner).toContain(
      '<template for="B:1">inner<!-- --></template>',
    );
  });

  it('writes render-blocking stylesheet links instead of waiting in $RR', async () => {
    function Styled() {
      readText('styled');
      return (
        <div>
          <link rel="stylesheet" href="foo.css" precedence="default" />
          styled
        </div>
      );
    }
    const r = await render(
      <html>
        <body>
          <Suspense fallback="loading">
            <Styled />
          </Suspense>
        </body>
      </html>,
      {unstable_declarativePatching: true},
    );
    const out = await r.finish(['styled']);
    expect(out).toContain(
      '<template for="B:0"><link rel="stylesheet" href="foo.css" data-precedence="default" blocking="render"><div>',
    );
    expect(out).not.toContain('$RR');
  });

  // The helpers below simulate what a parser with <template for> support does, since
  // jsdom parses `<?start name="x">` as a comment and ignores `for`.
  function applyPatches(container) {
    const templates = Array.from(container.querySelectorAll('template[for]'));
    templates.forEach(template => {
      const name = template.getAttribute('for');
      applyPatch(template, name);
    });
  }

  function applyPatch(template, name) {
    const parent = template.parentNode;
    // Find the marker in the template's parent tree.
    const walker = document.createTreeWalker(
      parent,
      window.NodeFilter.SHOW_COMMENT,
    );
    let start = null;
    while (walker.nextNode()) {
      if (walker.currentNode.data === '?start name="' + name + '"') {
        start = walker.currentNode;
        break;
      }
    }
    if (start === null) {
      return; // Inert, like the real thing.
    }
    const range = start.parentNode;
    let node = start.nextSibling;
    while (node !== null && node.data !== '?end') {
      const next = node.nextSibling;
      range.removeChild(node);
      node = next;
    }
    const end = node;
    while (template.content.firstChild) {
      range.insertBefore(template.content.firstChild, end);
    }
    range.removeChild(start);
    range.removeChild(end);
    template.remove();
  }

  // Server output is split on the shell so we can hydrate before or after patches.
  async function renderToContainer(count, options) {
    const r = await render(<App count={count} />, {
      unstable_declarativePatching: true,
      ...options,
    });
    const container = document.getElementById('container');
    const shell = r.shell();
    container.innerHTML = shell;
    return {container, r, shell};
  }

  it('hydrates boundaries that were patched before hydration', async () => {
    const {container, r} = await renderToContainer(3);
    const out = await r.finish(allTexts(3));
    container.innerHTML = out;
    applyPatches(container);
    expect(container.querySelectorAll('.fb').length).toBe(0);
    const nodes = Array.from(container.querySelectorAll('.item'));
    expect(nodes.length).toBe(3);

    const onClick = jest.fn();
    const errors = [];
    await act(() => {
      ReactDOMClient.hydrateRoot(
        container,
        <App count={3} onClick={onClick} />,
        {
          onRecoverableError: e => errors.push(e),
        },
      );
    });
    expect(errors).toEqual([]);
    // Same DOM nodes: hydrated, not client rendered.
    expect(Array.from(container.querySelectorAll('.item'))).toEqual(nodes);
    nodes[1].click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('observes patches on the original nodes and retries hydration', async () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    });
    const {container, r, shell} = await renderToContainer(2);
    const out = await r.finish(allTexts(2));
    const patches = out.slice(shell.length);

    const fallbacks = Array.from(container.querySelectorAll('.fb'));
    expect(fallbacks.length).toBe(2);

    textCache = new Map();
    const onClick = jest.fn();
    const errors = [];
    await act(() => {
      ReactDOMClient.hydrateRoot(
        container,
        <App count={2} onClick={onClick} />,
        {
          onRecoverableError: e => errors.push(e),
        },
      );
    });
    expect(container.querySelectorAll('.fb').length).toBe(2);

    allTexts(2).forEach(resolveText);
    await act(async () => {
      // Append only the patches so the existing nodes (and React's references) stay.
      const holder = document.createElement('div');
      holder.innerHTML = patches;
      while (holder.firstChild) {
        container.appendChild(holder.firstChild);
      }
      applyPatches(container);
    });
    await act(async () => {});

    expect(errors).toEqual([]);
    expect(container.querySelectorAll('.fb').length).toBe(0);
    const items = container.querySelectorAll('.item');
    expect(items.length).toBe(2);
    items[0].click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
