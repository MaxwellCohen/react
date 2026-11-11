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

jest.mock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFizzDeclarativePatching: true,
}));

import {patchMessageChannel} from '../../../../scripts/jest/patchMessageChannel';

global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

let React;
let ReactDOMFizzServer;
let ReactDOMFizzStatic;
let Suspense;
let serverAct;

describe('ReactDOMFizzServer declarative patching resume', () => {
  beforeEach(() => {
    jest.resetModules();
    window.setTimeout = setTimeout;
    patchMessageChannel();
    serverAct = require('internal-test-utils').serverAct;
    React = require('react');
    ReactDOMFizzServer = require('react-dom/server.browser');
    ReactDOMFizzStatic = require('react-dom/static.browser');
    Suspense = React.Suspense;
  });

  async function readContent(stream) {
    const reader = stream.getReader();
    let content = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        return content;
      }
      content += Buffer.from(value).toString('utf8');
    }
  }

  function occurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
  }

  async function prerenderAndResume(prerenderOptions) {
    let resolve;
    const promise = new Promise(r => (resolve = r));
    let prerendering = true;
    function Content() {
      if (prerendering) {
        React.use(promise);
      }
      return <p>content</p>;
    }
    function App() {
      return (
        <div>
          <Suspense fallback="loading">
            <Content />
          </Suspense>
        </div>
      );
    }

    const controller = new AbortController();
    let pending;
    await serverAct(() => {
      pending = ReactDOMFizzStatic.prerender(<App />, {
        signal: controller.signal,
        onError() {},
        ...prerenderOptions,
      });
    });
    await serverAct(() => controller.abort());
    const prerendered = await pending;
    expect(prerendered.postponed).not.toBe(null);
    const prelude = await readContent(prerendered.prelude);

    prerendering = false;
    const resumed = await serverAct(() =>
      ReactDOMFizzServer.resume(
        <App />,
        JSON.parse(JSON.stringify(prerendered.postponed)),
      ),
    );
    const resumeOut = await readContent(resumed);
    resolve();
    return {prelude, resumeOut};
  }

  it('resumes a declarative prerender with <template for> and $RP', async () => {
    const {prelude, resumeOut} = await prerenderAndResume({
      unstable_declarativePatching: true,
    });
    expect(prelude).toContain('<?start name="B:0">');
    expect(prelude).not.toContain('<template id="B:');
    expect(resumeOut).toContain(
      '<template for="B:0"><p>content</p></template>',
    );
    expect(resumeOut).not.toContain('$RP("B:');
    expect(occurrences(prelude + resumeOut, '$RP=')).toBe(1);
    expect(resumeOut).not.toContain('$RC(');
    expect(resumeOut).not.toContain('<div hidden id="S:');
  });

  it('resumes a classic prerender with $RC', async () => {
    const {prelude, resumeOut} = await prerenderAndResume({});
    expect(prelude).not.toContain('<?start');
    expect(resumeOut).toContain('$RC(');
    expect(resumeOut).not.toContain('<template for');
  });
});
