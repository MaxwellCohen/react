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
      pipe = ReactDOMFizzServer.renderToPipeableStream(element, {
        ...options,
      }).pipe;
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

  it('emits <?start> ranges, <template for> patches and a $RP script per group', async () => {
    const r = await render(<App count={BOUNDARIES} />, {
      unstable_declarativePatching: true,
    });
    const shell = r.shell();
    // The comment markers stay outside of the range so React keeps a stable node.
    expect(occurrences(shell, '<!--$?--><?start name="B:')).toBe(BOUNDARIES);
    expect(occurrences(shell, '<?end><!--/$-->')).toBe(BOUNDARIES);
    expect(shell).toContain('<!--B:0--><!--$?--><?start name="B:0">');
    expect(shell).not.toContain('<template id="B:');

    const out = await r.finish(allTexts(BOUNDARIES));
    expect(occurrences(out, '<template for="B:')).toBe(BOUNDARIES);
    expect(out).toContain(
      '<template for="B:0"><p class="item">item-0</p></template>',
    );
    expect(out).toContain('$RP("B:0"');
    // The declarative runtime is the only one inlined: no $RC or $RB bootstrap.
    expect(occurrences(out, '$RP=')).toBe(1);
    expect(out).not.toContain('$RC=');
    expect(out).not.toContain('$RB=');
    expect(out).not.toContain('$RC(');
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
    if (process.env.REPORT_FIZZ_BYTES) {
      console.log(
        JSON.stringify({BOUNDARIES, scriptBytes, declBytes}, null, 2),
      );
    }
  });

  it('needs far fewer nonced scripts for streamed completions', async () => {
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
    expect(occurrences(declOut, 'nonce="abc123"')).toBeLessThan(
      occurrences(scriptOut, 'nonce="abc123"'),
    );
  });

  it('keeps boundaries inside SVG and MathML on <template for>', async () => {
    function Circle() {
      readText('svg');
      return <circle r="2" />;
    }
    function Mi() {
      readText('math');
      return <mi>x</mi>;
    }
    const r = await render(
      <div>
        <svg>
          <Suspense fallback={<circle r="1" />}>
            <Circle />
          </Suspense>
        </svg>
        <math>
          <Suspense fallback={<mi>y</mi>}>
            <Mi />
          </Suspense>
        </math>
        <Suspense fallback="html">
          <Item i={0} />
        </Suspense>
      </div>,
      {unstable_declarativePatching: true},
    );
    const out = await r.finish(['svg', 'math', 'item-0']);
    // All three stay on <template for> + $RP. $RP reparses SVG/MathML via outerHTML.
    expect(occurrences(out, '<template for=')).toBe(3);
    expect(occurrences(out, '<?start')).toBe(3);
    expect(out).toContain(
      '<template for="B:0"><circle r="2"></circle></template>',
    );
    expect(out).toContain('<template for="B:1"><mi>x</mi></template>');
    expect(out).toContain('<template for="B:2"><p class="item">');
    expect(out).toContain('$RP(');
    expect(out).toContain('$RP("B:0"');
    expect(out).not.toContain('$RP(1,');
    expect(out).not.toContain('$RC(');
    expect(out).toContain('outerHTML');
  });

  // @gate enableViewTransition
  it('keeps boundaries inside a ViewTransition on <template for>', async () => {
    const ViewTransition = React.ViewTransition;
    const r = await render(
      <div>
        <ViewTransition>
          <div>
            <Suspense fallback="inside">
              <Item i={0} />
            </Suspense>
          </div>
        </ViewTransition>
      </div>,
      {unstable_declarativePatching: true},
    );
    const out = await r.finish(['item-0']);
    // Stay on declarative markers; the leading 1 asks $RP to wrap the batch in a
    // view transition.
    expect(occurrences(out, '<template for=')).toBe(1);
    expect(occurrences(out, '<?start')).toBe(1);
    expect(out).toContain('$RP("B:0")');
    expect(out).not.toContain('$RV=');
    expect(out).not.toContain('$RC=');
    expect(out).not.toContain('$RC(');
    expect(out).toContain('startViewTransition');
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
      /<template for="B:0"><section><!--B:1--><!--\$\?--><\?start name="B:1">inner-fallback<\?end><!--\/\$--><\/section><\/template>/,
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
    // The link goes in front of the template, not inside it. Chrome stalls the parser at
    // a body stylesheet, so the patch is only applied once the CSS has loaded.
    expect(out).toContain(
      '<link rel="stylesheet" href="foo.css" data-precedence="default" blocking="render"/><template for="B:0"><div>',
    );
    expect(out).not.toContain('$RR');
  });

  it('keeps all stylesheet props on the render-blocking link', async () => {
    function Styled() {
      readText('styled');
      return (
        <div>
          <link
            rel="stylesheet"
            href="foo.css"
            precedence="default"
            crossOrigin="anonymous"
            integrity="sha384-abc"
            media="print"
          />
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
    const match = out.match(/(<link [^>]*>)<template for="B:0">/);
    expect(match).not.toBe(null);
    const link = match[1];
    expect(link).toContain('crossorigin="anonymous"');
    expect(link).toContain('integrity="sha384-abc"');
    expect(link).toContain('media="print"');
    expect(link).toContain('data-precedence="default"');
    expect(link).toContain('blocking="render"');
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

  it('hydrates past inline late styles carried by a patch', async () => {
    function Styled({onClick}) {
      readText('styled');
      return (
        <>
          <style href="late-1" precedence="default">
            {'.item{color:red}'}
          </style>
          <div className="item" onClick={onClick}>
            styled
          </div>
        </>
      );
    }
    function StyledApp({onClick}) {
      return (
        <div id="app">
          <Suspense fallback={<p className="fb">loading</p>}>
            <Styled onClick={onClick} />
          </Suspense>
        </div>
      );
    }
    const r = await render(<StyledApp />, {unstable_declarativePatching: true});
    const container = document.getElementById('container');
    container.innerHTML = r.shell();
    const out = await r.finish(['styled']);
    // The late style is written inline, at the start of the patch.
    expect(out).toContain(
      '<template for="B:0"><style data-precedence="default"',
    );
    container.innerHTML = out;
    applyPatches(container);
    const node = container.querySelector('.item');
    expect(node).not.toBe(null);

    textCache = new Map();
    resolveText('styled');
    const onClick = jest.fn();
    const errors = [];
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <StyledApp onClick={onClick} />, {
        onRecoverableError: e => errors.push(e),
      });
    });
    // The style sits in front of the first element of the boundary. Hydration has to
    // step over it instead of reporting a mismatch.
    expect(errors).toEqual([]);
    expect(container.querySelector('.item')).toBe(node);
    node.click();
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

  it('removes the anchor together with a deleted dehydrated boundary', async () => {
    const {container} = await renderToContainer(2);
    expect(container.innerHTML).toContain('<!--B:1-->');
    const anchors = () =>
      Array.from(container.querySelectorAll('*'))
        .flatMap(el => Array.from(el.childNodes))
        .filter(n => n.nodeType === 8 && /^B:/.test(n.data));
    expect(anchors().length).toBe(2);
    textCache = new Map();
    allTexts(2).forEach(resolveText);
    const errors = [];
    await act(() => {
      // The client has one boundary fewer, so the second dehydrated one is deleted.
      ReactDOMClient.hydrateRoot(container, <App count={1} />, {
        onRecoverableError: e => errors.push(e),
      });
    });
    expect(anchors().map(n => n.data)).not.toContain('B:1');
  });

  it('client renders an errored boundary as soon as its marker arrives', async () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    });
    function Boom() {
      readText('boom');
      throw new Error('boom');
    }
    function ErrorApp({fallbackOnClient}) {
      return (
        <div id="app">
          <Suspense fallback={<span className="fb">Loading</span>}>
            {fallbackOnClient ? (
              <p className="client">client rendered</p>
            ) : (
              <Boom />
            )}
          </Suspense>
        </div>
      );
    }
    const r = await render(<ErrorApp />, {
      unstable_declarativePatching: true,
      onError: () => 'digest-2',
    });
    const container = document.getElementById('container');
    const shell = r.shell();
    container.innerHTML = shell;
    expect(container.querySelectorAll('.fb').length).toBe(1);

    const errors = [];
    await act(() => {
      ReactDOMClient.hydrateRoot(
        container,
        <ErrorApp fallbackOnClient={true} />,
        {onRecoverableError: e => errors.push(e)},
      );
    });
    // Still waiting: the document is loading and nothing told us the boundary errored.
    expect(container.querySelectorAll('.client').length).toBe(0);

    const out = await r.finish(['boom']);
    const marker = out.slice(shell.length);
    expect(marker).toContain('data-dgst="digest-2"');
    await act(async () => {
      // The marker is written at the body level, outside the boundary's own parent.
      const holder = document.createElement('div');
      holder.innerHTML = marker;
      while (holder.firstChild) {
        document.body.appendChild(holder.firstChild);
      }
    });
    await act(async () => {});
    expect(container.querySelectorAll('.client').length).toBe(1);
    expect(errors.length).toBe(1);
    expect(errors[0].digest).toBe('digest-2');
  });
});
