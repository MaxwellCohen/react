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
let upgradeToViewTransitions;

describe('$RP runtime (polyfill path)', () => {
  let window;
  let document;

  beforeEach(() => {
    JSDOM = require('jsdom').JSDOM;
    patchDeclarativeBoundaries =
      require('react-dom-bindings/src/server/fizz-instruction-set/ReactDOMFizzInstructionSetInlineCodeStrings').patchDeclarativeBoundaries;
    upgradeToViewTransitions =
      require('react-dom-bindings/src/server/fizz-instruction-set/ReactDOMFizzInstructionSetInlineCodeStrings').patchDeclarativeBoundariesUpgradeToViewTransitions;
    const jsdom = new JSDOM(
      '<!DOCTYPE html><html><head></head><body></body></html>',
      {runScripts: 'outside-only', pretendToBeVisual: true},
    );
    window = jsdom.window;
    document = window.document;
    window.eval(patchDeclarativeBoundaries);
  });

  // $RP batches behind a throttle. A shell time far in the past makes it flush on the
  // next timer.
  async function patch(...ids) {
    window.$RT = -1e6;
    window.$RP(...ids);
    jest.runOnlyPendingTimers();
  }

  function pending(name, fallback) {
    return (
      '<!--$?--><?start name="' + name + '">' + fallback + '<?end><!--/$-->'
    );
  }

  // Template content is inert, so it is safe to put right in the markup.
  function setBody(html) {
    document.body.innerHTML = html;
  }

  // Drops the markers like a native patch does, for assertions on visible content.
  function visible() {
    return document.body.innerHTML.replace(/<!--[^>]*-->/g, '');
  }

  it('drops a template whose boundary was removed instead of replacing other content', async () => {
    // B:a's start marker is gone; only B:b remains. The B:a template is an orphan.
    setBody(
      pending('B:b', 'fb-b') +
        '<p>after</p>' +
        '<template for="B:a">evil</template>' +
        '<template for="B:b">good</template>',
    );
    await patch('B:a', 'B:b');
    expect(visible()).toBe('good<p>after</p>');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('drops a template when no start marker was collected for that id', async () => {
    setBody(
      '<!--$?--><?start name="B:other">fb<?end><!--/$-->' +
        '<template for="B:a">evil</template>',
    );
    await patch('B:a');
    expect(visible()).toBe('fb');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('drops a template for a boundary that is no longer pending', async () => {
    setBody(
      '<!--$--><?start name="B:a">done<?end><!--/$-->' +
        '<template for="B:a">evil</template>',
    );
    await patch('B:a');
    expect(visible()).toBe('done');
  });

  it('replaces the fallback range with the template content', async () => {
    setBody(
      '<div id="a">' +
        pending('B:a', 'fb-a') +
        '</div><p>x</p><template for="B:a"><span>done</span></template>',
    );
    await patch('B:a');
    expect(visible()).toBe('<div id="a"><span>done</span></div><p>x</p>');
    // The range markers are gone with the fallback; the boundary comments stay.
    expect(document.body.innerHTML).not.toContain('?start');
    expect(document.body.innerHTML).not.toContain('?end');
    expect(document.body.innerHTML).toContain('<!--$-->');
    expect(document.body.innerHTML).toContain('<!--/$-->');
  });

  it('patches a group of boundaries, parents before children', async () => {
    setBody(
      pending('B:p', 'fb-p') +
        '<template for="B:p">[' +
        pending('B:c', 'fb-c') +
        ']</template>' +
        '<template for="B:c">child</template>',
    );
    await patch('B:p', 'B:c');
    expect(visible()).toBe('[child]');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('does not touch a range React already created DOM for', async () => {
    setBody(
      pending('B:a', '<i id="client">client</i>') +
        '<template for="B:a">server</template>',
    );
    // React hydrated or client rendered into the range before the template arrived.
    document.getElementById('client').__reactFiber$test = {};
    await patch('B:a');
    expect(visible()).toBe('<i id="client">client</i>');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('is a no-op when the browser already applied the patch', async () => {
    // Native support consumes the template and the markers.
    setBody('<!--$?-->done<!--/$-->');
    const before = document.body.innerHTML;
    await patch('B:a');
    expect(document.body.innerHTML).toBe(before);
  });

  it('reparses patched children into the SVG namespace', async () => {
    setBody(
      '<svg>' +
        pending('B:a', '<circle r="1"></circle>') +
        '</svg><template for="B:a"><circle r="2"></circle></template>',
    );
    const svg = document.querySelector('svg');
    await patch('B:a');
    expect(document.querySelector('svg')).toBe(svg);
    expect(visible()).toBe('<svg><circle r="2"></circle></svg>');
    const circle = document.querySelector('circle');
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('restores <image> that the HTML parser turned into <img> inside SVG', async () => {
    setBody(
      '<svg>' +
        pending('B:a', '<circle r="1"></circle>') +
        '</svg><template for="B:a"><g><img href="a.png"><foreignObject><img src="b.png"></foreignObject></g></template>',
    );
    await patch('B:a');
    const image = document.querySelector('svg image');
    expect(image.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(image.getAttribute('href')).toBe('a.png');
    expect(document.querySelectorAll('img').length).toBe(1);
  });

  it('hoists late styles to their precedence position in the head', async () => {
    document.head.innerHTML =
      '<style data-precedence="a" data-href="x">x{}</style>' +
      '<style data-precedence="b" data-href="y">y{}</style>';
    setBody(
      pending('B:a', 'fallback') +
        '<template for="B:a"><style data-precedence="a" data-href="z">z{}</style><p>hi</p></template>',
    );
    await patch('B:a');
    expect(
      Array.from(document.head.children).map(n => n.getAttribute('data-href')),
    ).toEqual(['x', 'z', 'y']);
    expect(visible()).toBe('<p>hi</p>');
  });

  it('is a no-op after native DPU already applied into SVG', async () => {
    // Native support consumed the template and start marker. With no <!--B:n-->
    // anchor, $RP has nothing to find; SVG reparsing happens when $RP itself
    // inserts (scripts blank names so native does not win that path).
    setBody('<svg><!--$?--><circle r="2"></circle><!--/$--></svg>');
    const before = document.body.innerHTML;
    await patch('B:a');
    expect(document.body.innerHTML).toBe(before);
  });

  it('patches without a view transition unless $RW was upgraded', async () => {
    let calls = 0;
    document.startViewTransition = () => {
      calls++;
      return {};
    };
    setBody(pending('B:a', 'fb') + '<template for="B:a">done</template>');
    await patch('B:a');
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

    function fixture() {
      setBody(
        '<div>' +
          pending('B:p', '<i vt-exit="auto" vt-name="x">fb-p</i>') +
          '</div>' +
          '<template for="B:p"><b vt-enter="auto" vt-name="y">[' +
          pending('B:c', 'fb-c') +
          ']</b></template>' +
          '<template for="B:c">child</template>',
      );
    }

    it('applies per-element names and the whole batch inside one transition', async () => {
      fixture();
      // No await: the names are restored once the transition is ready.
      patch('B:p', 'B:c');
      expect(transitions.length).toBe(1);
      // Names are on the exiting fallback and the entering content before the update.
      expect(document.querySelector('i').style.viewTransitionName).toBe('x');
      expect(
        document.querySelector('template[for="B:p"]').content.firstChild.style
          .viewTransitionName,
      ).toBe('y');
      transitions[0].options.update();
      expect(visible()).toBe(
        '<div><b vt-enter="auto" vt-name="y" style="view-transition-name: y;">[child]</b></div>',
      );
      expect(document.querySelectorAll('template').length).toBe(0);
    });

    it('batches consecutive groups into one transition', async () => {
      fixture();
      window.$RT = -1e6;
      window.$RP('B:p');
      window.$RP('B:c');
      jest.runOnlyPendingTimers();
      expect(transitions.length).toBe(1);
      transitions[0].options.update();
      expect(document.body.textContent).toContain('[child]');
    });
  });

  it('holds patches until the throttle expires and applies them together', async () => {
    setBody(
      pending('B:a', 'fa') +
        pending('B:b', 'fb') +
        '<template for="B:a">A</template><template for="B:b">B</template>',
    );
    window.$RT = window.performance.now();
    window.$RP('B:a');
    window.$RP('B:b');
    jest.advanceTimersByTime(100);
    expect(document.body.textContent).toBe('fafb');
    jest.advanceTimersByTime(300);
    expect(document.body.textContent).toBe('AB');
  });

  it('collects <?start> markers into $RPS and blanks their names so the browser cannot patch them', () => {
    const pi = document.createProcessingInstruction('start', 'name="B:a"');
    document.body.appendChild(pi);
    window.$RP();
    expect(pi.parentNode).toBe(document.body);
    expect(pi.data).toBe('name=""');
    expect(window.$RPS.get('B:a')).toBe(pi);
    expect(window.$RPI.get(pi)).toBe('B:a');
  });

  it('collects comment-form <?start> markers and blanks their names', () => {
    setBody('<!--$?--><?start name="B:a">fb<?end><!--/$-->');
    // jsdom parses <?start> as a comment.
    window.$RP();
    expect(window.$RPS.has('B:a')).toBe(true);
    const marker = window.$RPS.get('B:a');
    expect(marker.nodeType).toBe(8);
    expect(marker.data).toBe('?start name=""');
    expect(window.$RPI.get(marker)).toBe('B:a');
  });

  it('calls _reactRetry after replacing a range', async () => {
    setBody(pending('B:a', 'fb') + '<template for="B:a">done</template>');
    const start = document.body.firstChild;
    let called = 0;
    start._reactRetry = () => {
      called++;
    };
    await patch('B:a');
    // $RP schedules _reactRetry on rAF after the replace.
    jest.runOnlyPendingTimers();
    expect(visible()).toBe('done');
    expect(called).toBe(1);
  });
});
