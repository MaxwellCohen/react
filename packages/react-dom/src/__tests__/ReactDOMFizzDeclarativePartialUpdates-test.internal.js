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

import {insertNodesAndExecuteScripts} from '../test-utils/FizzTestUtils';

let React;
let Suspense;
let ReactDOMFizzServer;
let Stream;
let document;
let writable;
let container;
let buffer = '';

describe('ReactDOMFizzDeclarativePartialUpdates', () => {
  beforeEach(() => {
    jest.resetModules();
    const JSDOM = require('jsdom').JSDOM;
    React = require('react');
    Suspense = React.Suspense;
    ReactDOMFizzServer = require('react-dom/server');
    Stream = require('stream');

    const jsdom = new JSDOM(
      '<!DOCTYPE html><html><head></head><body><div id="container">',
      {runScripts: 'dangerously'},
    );
    document = jsdom.window.document;
    container = document.getElementById('container');
    global.window = jsdom.window;
    global.document = document;
    global.requestAnimationFrame = cb => setTimeout(cb);
    buffer = '';

    writable = new Stream.PassThrough();
    writable.setEncoding('utf8');
    writable.on('data', chunk => {
      buffer += chunk;
    });
  });

  async function serverAct(callback) {
    await callback();
    await new Promise(resolve => setImmediate(resolve));
    const content = buffer;
    buffer = '';
    if (content !== '') {
      const temp = document.createElement('body');
      temp.innerHTML = content;
      await insertNodesAndExecuteScripts(temp, container, null);
      jest.runAllTimers();
    }
    return content;
  }

  it('emits start/end markers and declarative completion for one-shot boundaries', async () => {
    let resolve;
    const promise = new Promise(r => (resolve = r));
    function Suspend() {
      return React.use(promise);
    }

    const shell = await serverAct(async () => {
      const {pipe} = ReactDOMFizzServer.renderToPipeableStream(
        <div>
          <Suspense fallback="Loading">
            <Suspend />
          </Suspense>
        </div>,
      );
      pipe(writable);
    });

    expect(shell).toContain(
      '<!--$?--><template id="B:0"></template><?start name="B:0">',
    );
    expect(shell).toContain('<?end><!--/$-->');
    expect(shell).not.toContain('<div hidden id="S:');

    const completion = await serverAct(async () => {
      resolve('Done');
    });

    expect(completion).toContain('<template for="B:');
    expect(completion).toContain('$RC("B:');
    expect(completion).not.toContain('$RC("B:0","S:');
    expect(container.textContent).toContain('Done');
    expect(container.textContent).not.toContain('Loading');
  });

  it('falls back to classic S: completion after a progressive partial flush', async () => {
    let resolve;
    const promise = new Promise(r => (resolve = r));
    function Suspend() {
      return React.use(promise);
    }

    const shell = await serverAct(async () => {
      const {pipe} = ReactDOMFizzServer.renderToPipeableStream(
        <div>
          <Suspense fallback="Loading">
            <span>
              <Suspend />
            </span>
          </Suspense>
        </div>,
      );
      pipe(writable);
    });

    // Outlined child leaves a P: hole, so the root is flushed as a classic S: container.
    expect(shell).toContain('<?start name="B:0">');
    expect(shell).toContain('<div hidden id="S:');

    const completion = await serverAct(async () => {
      resolve('Done');
    });

    expect(completion).toContain('$RC("B:');
    expect(completion).toContain(',"S:');
    expect(completion).not.toContain('<template for="B:');
    expect(container.textContent).toContain('Done');
  });
});
