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

describe('$RP runtime (polyfill path)', () => {
  let window;
  let document;

  beforeEach(() => {
    JSDOM = require('jsdom').JSDOM;
    patchDeclarativeBoundaries =
      require('react-dom-bindings/src/server/fizz-instruction-set/ReactDOMFizzInstructionSetInlineCodeStrings').patchDeclarativeBoundaries;
    const jsdom = new JSDOM(
      '<!DOCTYPE html><html><head></head><body></body></html>',
      {runScripts: 'outside-only'},
    );
    window = jsdom.window;
    document = window.document;
    window.eval(patchDeclarativeBoundaries);
  });

  function pending(name, fallback) {
    return (
      '<!--' +
      name +
      '--><!--$?--><?start name="' +
      name +
      '">' +
      fallback +
      '<?end><!--/$-->'
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

  it('drops a template whose anchor was orphaned instead of replacing other content', () => {
    // B:a's boundary was removed by React but its anchor stayed. The next sibling is
    // now the following boundary's anchor, not a pending start comment.
    setBody(
      '<!--B:a-->' +
        pending('B:b', 'fb-b') +
        '<p>after</p>' +
        '<template for="B:a">evil</template>' +
        '<template for="B:b">good</template>',
    );
    window.$RP('B:a', 'B:b');
    expect(visible()).toBe('good<p>after</p>');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('drops a template when the range marker names another boundary', () => {
    setBody(
      '<!--B:a--><!--$?--><?start name="B:other">fb<?end><!--/$-->' +
        '<template for="B:a">evil</template>',
    );
    window.$RP('B:a');
    expect(visible()).toBe('fb');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('drops a template for a boundary that is no longer pending', () => {
    setBody(
      '<!--B:a--><!--$--><?start name="B:a">done<?end><!--/$-->' +
        '<template for="B:a">evil</template>',
    );
    window.$RP('B:a');
    expect(visible()).toBe('done');
  });

  it('replaces the fallback range with the template content', () => {
    setBody(
      '<div id="a">' +
        pending('B:a', 'fb-a') +
        '</div><p>x</p><template for="B:a"><span>done</span></template>',
    );
    window.$RP('B:a');
    expect(visible()).toBe('<div id="a"><span>done</span></div><p>x</p>');
    // The range markers are gone with the fallback; the boundary comments stay.
    expect(document.body.innerHTML).not.toContain('?start');
    expect(document.body.innerHTML).not.toContain('?end');
    expect(document.body.innerHTML).toContain('<!--$?-->');
    expect(document.body.innerHTML).toContain('<!--/$-->');
  });

  it('patches a group of boundaries, parents before children', () => {
    setBody(
      pending('B:p', 'fb-p') +
        '<template for="B:p">[' +
        pending('B:c', 'fb-c') +
        ']</template>' +
        '<template for="B:c">child</template>',
    );
    window.$RP('B:p', 'B:c');
    expect(visible()).toBe('[child]');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('does not touch a range React already created DOM for', () => {
    setBody(
      pending('B:a', '<i id="client">client</i>') +
        '<template for="B:a">server</template>',
    );
    // React hydrated or client rendered into the range before the template arrived.
    document.getElementById('client').__reactFiber$test = {};
    window.$RP('B:a');
    expect(visible()).toBe('<i id="client">client</i>');
    expect(document.querySelectorAll('template').length).toBe(0);
  });

  it('is a no-op when the browser already applied the patch', () => {
    // Native support consumes the template and the markers.
    setBody('<!--B:a--><!--$?-->done<!--/$-->');
    const before = document.body.innerHTML;
    window.$RP('B:a');
    expect(document.body.innerHTML).toBe(before);
  });

  it('leaves SVG content in its parent namespace untouched', () => {
    // SVG boundaries never use patches, so $RP must not reparse anything.
    setBody(
      '<svg>' +
        pending('B:a', '<circle r="1"></circle>') +
        '</svg><template for="B:a"><circle r="2"></circle></template>',
    );
    const svg = document.querySelector('svg');
    window.$RP('B:a');
    expect(document.querySelector('svg')).toBe(svg);
    expect(visible()).toBe('<svg><circle r="2"></circle></svg>');
  });
});
