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
});
