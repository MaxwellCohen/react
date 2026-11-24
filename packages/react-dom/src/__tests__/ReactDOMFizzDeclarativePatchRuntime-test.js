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

// Evaluates the real $RP runtime string (what the server inlines) in jsdom, which has no
// native <template for> support, so this is the polyfill path.

let JSDOM;
let patchDeclarativeBoundaries;
let fixDeclarativeNamespaces;
let hoistDeclarativePatchStyles;
let upgradeToViewTransitions;

describe('$RP runtime (polyfill path)', () => {
  let window;
  let document;

  beforeEach(() => {
    JSDOM = require('jsdom').JSDOM;
    const strings = require('react-dom-bindings/src/server/fizz-instruction-set/ReactDOMFizzInstructionSetInlineCodeStrings');
    patchDeclarativeBoundaries = strings.patchDeclarativeBoundaries;
    fixDeclarativeNamespaces = strings.fixDeclarativeNamespaces;
    hoistDeclarativePatchStyles = strings.hoistDeclarativePatchStyles;
    // $RP reveals with $RV, so it is upgraded like the script path.
    upgradeToViewTransitions = strings.completeBoundaryUpgradeToViewTransitions;
    const jsdom = new JSDOM(
      '<!DOCTYPE html><html><head></head><body></body></html>',
      {runScripts: 'outside-only', pretendToBeVisual: true},
    );
    window = jsdom.window;
    document = window.document;
    // Base bootstrap only — SVG/style helpers are installed by tests that need them,
    // matching the server emitting $RPN/$RPH only when a patch requires them.
    window.eval(patchDeclarativeBoundaries);
  });

  function pending(name, fallback) {
    return (
      '<!--$?--><?start name="' + name + '">' + fallback + '<?end><!--/$-->'
    );
  }

  // The shell, and the $RP() call the server writes after it.
  function shell(html) {
    document.body.innerHTML = html;
    window.$RP();
  }

  // Appends to the body like the parser does while it streams.
  function stream(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    while (template.content.firstChild) {
      document.body.appendChild(template.content.firstChild);
    }
  }

  // A group that ends with <script>$RP()</script>: queues every patch before it. A
  // shell time far in the past makes the throttle reveal on the next timer.
  function patch(html) {
    stream(html);
    window.$RT = -1e6;
    window.$RP();
    jest.runOnlyPendingTimers();
  }

  // Lets the MutationObserver deliver, as it does when the parser yields.
  async function parserYields() {
    await Promise.resolve();
    await Promise.resolve();
  }

  // Drops the markers like a native patch does, for assertions on visible content.
  function visible() {
    return document.body.innerHTML.replace(/<!--[^>]*-->/g, '');
  }

  it('replaces the fallback range with the template content', () => {
    shell('<p>before</p>' + pending('B:a', '<i>fallback</i>') + '<p>after</p>');
    patch('<template for="B:a"><b>done</b></template>');
    expect(visible()).toBe('<p>before</p><b>done</b><p>after</p>');
    expect(document.body.innerHTML).toContain('<!--$--><b>done</b><!--/$-->');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('queues the patches before a sentinel once the parser yields', async () => {
    shell(pending('B:a', 'fa') + pending('B:b', 'fb'));
    window.$RT = -1e6;
    // B:b is not followed by a sentinel: it may still be parsing.
    stream(
      '<template for="B:a">A</template><!----><template for="B:b">B</template>',
    );
    await parserYields();
    jest.runOnlyPendingTimers();
    expect(visible()).toBe('Afb<template for="B:b">B</template>');
    stream('<!---->');
    await parserYields();
    window.$RT = -1e6;
    jest.runOnlyPendingTimers();
    expect(visible()).toBe('AB');
  });

  it('marks a queued boundary so React does not client render it', async () => {
    shell(pending('B:a', 'fa'));
    window.$RT = window.performance.now();
    stream('<template for="B:a">A</template><!---->');
    await parserYields();
    expect(document.body.firstChild.data).toBe('$~');
    expect(document.body.textContent).toBe('fa');
  });

  it('lets React client render a boundary that errored on the server', () => {
    shell(pending('B:a', 'fa') + pending('B:b', 'fb'));
    const start = document.body.firstChild;
    let retried = 0;
    start._reactRetry = () => {
      retried++;
    };
    // Needs no sentinel: the marker has no content to wait for.
    stream('<template data-rcr id="E:B:a" data-dgst="digest"></template>');
    window.$RP();
    expect(start.data).toBe('$!');
    expect(retried).toBe(1);
    // The details stay where React reads them.
    expect(document.getElementById('E:B:a').dataset.dgst).toBe('digest');
    expect(document.body.textContent).toBe('fafb');
  });

  it('queues the patches that were parsed before it was set up', () => {
    document.body.innerHTML =
      pending('B:a', 'fa') + '<template for="B:a">A</template><!---->';
    window.$RT = -1e6;
    window.$RP();
    jest.runOnlyPendingTimers();
    expect(visible()).toBe('A');
  });

  it('observes the element it is given instead of the body', () => {
    document.body.innerHTML =
      '<div id="root">' + pending('B:a', 'fa') + '</div>';
    const root = document.getElementById('root');
    // The external runtime passes the parent of its instruction.
    window.$RP(root);
    root.insertAdjacentHTML('beforeend', '<template for="B:a">A</template>');
    window.$RT = -1e6;
    window.$RP();
    jest.runOnlyPendingTimers();
    expect(root.textContent).toBe('A');
  });

  it('queues what is left when the document is done', () => {
    shell('<div id="root">' + pending('B:a', 'fa') + '</div>');
    // Not where the stream is observed, and without a sentinel.
    document
      .getElementById('root')
      .insertAdjacentHTML('beforeend', '<template for="B:a">A</template>');
    window.$RT = -1e6;
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    jest.runOnlyPendingTimers();
    expect(document.getElementById('root').textContent).toBe('A');
  });

  it('drops a template whose boundary was removed instead of replacing other content', () => {
    // React client rendered B:a: it removed the range with its markers.
    shell(pending('B:a', 'fb-a') + pending('B:b', 'fb-b') + '<p>after</p>');
    const body = document.body;
    while (body.firstChild.data !== '/$') {
      body.removeChild(body.firstChild);
    }
    body.removeChild(body.firstChild);
    patch(
      '<template for="B:a">evil</template><template for="B:b">good</template>',
    );
    expect(visible()).toBe('good<p>after</p>');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('drops a template when there is no start marker for that id', () => {
    shell('<p>keep</p>');
    patch('<template for="B:a">orphan</template>');
    expect(visible()).toBe('<p>keep</p>');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('drops a template for a boundary that is no longer pending', () => {
    shell('<!--$--><?start name="B:a">shown<?end><!--/$-->');
    patch('<template for="B:a">late</template>');
    expect(visible()).toBe('shown');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('leaves the markers and templates of the page alone', () => {
    shell('<?start name="mine">theirs<?end>' + pending('B:a', 'fa'));
    const marker = document.body.firstChild;
    patch('<template for="mine">no</template><template for="B:a">A</template>');
    expect(document.body.firstChild).toBe(marker);
    expect(document.body.textContent).toBe('theirsA');
    expect(document.querySelectorAll('template[for="mine"]').length).toBe(1);
  });

  it('patches a group of boundaries, a child inside the content of its parent', () => {
    shell(pending('B:1', 'fb-p'));
    patch(
      '<template for="B:1">[' +
        pending('B:2', 'fb-c') +
        ']</template>' +
        '<template for="B:2">child</template>',
    );
    expect(visible()).toBe('[child]');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('patches a child that completes after its parent was revealed', () => {
    shell(pending('B:1', 'fb-p'));
    patch('<template for="B:1">[' + pending('B:2', 'fb-c') + ']</template>');
    expect(visible()).toBe('[fb-c]');
    patch('<template for="B:2">child</template>');
    expect(visible()).toBe('[child]');
  });

  it('is a no-op when the browser already applied the patch', () => {
    // Native support consumes the template and the markers.
    shell('<!--$?-->done<!--/$-->');
    const before = document.body.innerHTML;
    patch('');
    expect(document.body.innerHTML).toBe(before);
  });

  it('takes a processing instruction marker away from the parser', () => {
    // What a browser with native support parses <?start name="B:a"> as.
    document.body.innerHTML = '<!--$?-->fb<!--/$-->';
    const start = document.createProcessingInstruction('start', 'name="B:a"');
    const end = document.createProcessingInstruction('end', '');
    document.body.insertBefore(start, document.body.childNodes[1]);
    document.body.insertBefore(end, document.body.lastChild);
    window.$RP();
    // A comment is not a target for a <template for>, and it still has the name
    // that React reads when the boundary errors.
    expect(start.parentNode).toBe(null);
    expect(end.parentNode).toBe(null);
    expect(document.body.innerHTML).toBe(
      '<!--$?--><!--?start name="B:a"-->fb<!--?end--><!--/$-->',
    );
    patch('<template for="B:a">done</template>');
    expect(visible()).toBe('done');
  });

  it('reparses patched children into the SVG namespace', () => {
    window.eval(fixDeclarativeNamespaces);
    shell('<svg>' + pending('B:a', '<circle r="1"></circle>') + '</svg>');
    const svg = document.querySelector('svg');
    patch('<template for="B:a"><circle r="2"></circle></template>');
    expect(document.querySelector('svg')).toBe(svg);
    expect(visible()).toBe('<svg><circle r="2"></circle></svg>');
    const circle = document.querySelector('circle');
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('keeps a boundary inside reparsed SVG content patchable', () => {
    window.eval(fixDeclarativeNamespaces);
    shell('<svg>' + pending('B:a', '<circle r="1"></circle>') + '</svg>');
    patch(
      '<template for="B:a"><g>' +
        pending('B:b', '<circle r="2"></circle>') +
        '</g></template>',
    );
    patch('<template for="B:b"><circle r="3"></circle></template>');
    expect(visible()).toBe('<svg><g><circle r="3"></circle></g></svg>');
    expect(document.querySelector('circle').namespaceURI).toBe(
      'http://www.w3.org/2000/svg',
    );
  });

  it('restores <image> that the HTML parser turned into <img> inside SVG', () => {
    window.eval(fixDeclarativeNamespaces);
    shell('<svg>' + pending('B:a', '<circle r="1"></circle>') + '</svg>');
    patch(
      '<template for="B:a"><g><img href="a.png"><foreignObject><img src="b.png"></foreignObject></g></template>',
    );
    const image = document.querySelector('svg image');
    expect(image.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(image.getAttribute('href')).toBe('a.png');
    expect(document.querySelectorAll('img').length).toBe(1);
  });

  it('hoists late styles to their precedence position in the head', () => {
    window.eval(hoistDeclarativePatchStyles);
    document.head.innerHTML =
      '<style data-precedence="a" data-href="x">x{}</style>' +
      '<style data-precedence="b" data-href="y">y{}</style>';
    shell(pending('B:a', 'fallback'));
    patch(
      '<template for="B:a"><style data-precedence="a" data-href="z">z{}</style><p>hi</p></template>',
    );
    expect(
      Array.from(document.head.children).map(n => n.getAttribute('data-href')),
    ).toEqual(['x', 'z', 'y']);
    expect(visible()).toBe('<p>hi</p>');
  });

  it('patches without a view transition unless $RV was upgraded', () => {
    let calls = 0;
    document.startViewTransition = () => {
      calls++;
      return {};
    };
    shell(pending('B:a', 'fb'));
    patch('<template for="B:a">done</template>');
    expect(calls).toBe(0);
    expect(visible()).toBe('done');
  });

  describe('upgraded to view transitions', () => {
    let transitions;
    beforeEach(() => {
      transitions = [];
      window.eval(upgradeToViewTransitions);
      window.CSS = {escape: name => name};
      document.fonts = {ready: Promise.resolve()};
      // jsdom has no layout; pretend everything is visible.
      window.Element.prototype.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 10,
        height: 10,
      });
      document.startViewTransition = options => {
        const transition = {
          ready: Promise.resolve(),
          finished: new Promise(() => {}),
        };
        transitions.push({options, transition});
        return transition;
      };
    });

    const parent =
      '<template for="B:1"><b vt-enter="auto" vt-name="y">[' +
      pending('B:2', 'fb-c') +
      ']</b></template>';
    const child = '<template for="B:2">child</template>';

    function fixture() {
      shell(
        '<div>' +
          pending('B:1', '<i vt-exit="auto" vt-name="x">fb-p</i>') +
          '</div>',
      );
    }

    it('applies per-element names and the whole batch inside one transition', () => {
      fixture();
      stream(parent + child);
      const entering = document.querySelector('template').content.firstChild;
      patch('');
      expect(transitions.length).toBe(1);
      // Names are on the exiting fallback and the entering content before the update.
      expect(document.querySelector('i').style.viewTransitionName).toBe('x');
      expect(entering.style.viewTransitionName).toBe('y');
      transitions[0].options.update();
      expect(visible()).toBe(
        '<div><b vt-enter="auto" vt-name="y" style="view-transition-name: y;">[child]</b></div>',
      );
      expect(document.querySelectorAll('template').length).toBe(0);
    });

    it('batches consecutive groups into one transition', () => {
      fixture();
      window.$RT = window.performance.now();
      stream(parent);
      window.$RP();
      stream(child);
      window.$RP();
      jest.runOnlyPendingTimers();
      expect(transitions.length).toBe(1);
      transitions[0].options.update();
      expect(document.body.textContent).toContain('[child]');
    });
  });

  it('holds patches until the throttle expires and applies them together', () => {
    shell(pending('B:a', 'fa') + pending('B:b', 'fb'));
    window.$RT = window.performance.now();
    stream('<template for="B:a">A</template>');
    window.$RP();
    stream('<template for="B:b">B</template>');
    window.$RP();
    jest.advanceTimersByTime(100);
    expect(document.body.textContent).toBe('fafb');
    jest.advanceTimersByTime(300);
    expect(document.body.textContent).toBe('AB');
  });

  it('calls _reactRetry after replacing a range', () => {
    shell(pending('B:a', 'fb'));
    const start = document.body.firstChild;
    let called = 0;
    start._reactRetry = () => {
      called++;
    };
    patch('<template for="B:a">done</template>');
    // $RV schedules _reactRetry on rAF after the replace.
    jest.runOnlyPendingTimers();
    expect(visible()).toBe('done');
    expect(called).toBe(1);
  });
});
