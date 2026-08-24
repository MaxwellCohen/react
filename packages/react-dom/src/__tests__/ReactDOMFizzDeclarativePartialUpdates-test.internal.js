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

let JSDOM;
let React;
let Suspense;
let ReactDOMFizzServer;
let ReactFeatureFlags;
let Stream;
let document;
let writable;
let container;
let buffer = '';
let hasErrored = false;
let fatalError = undefined;

describe('ReactDOMFizzDeclarativePartialUpdates', () => {
  beforeEach(() => {
    jest.resetModules();

    ReactFeatureFlags = require('shared/ReactFeatureFlags');
    ReactFeatureFlags.enableFizzDeclarativePartialUpdates = true;

    JSDOM = require('jsdom').JSDOM;
    React = require('react');
    Suspense = React.Suspense;
    ReactDOMFizzServer = require('react-dom/server');
    Stream = require('stream');

    const jsdom = new JSDOM(
      '<!DOCTYPE html><html><head></head><body><div id="container">',
      {
        runScripts: 'dangerously',
      },
    );
    document = jsdom.window.document;
    container = document.getElementById('container');
    global.window = jsdom.window;
    global.document = document;
    global.NodeFilter = jsdom.window.NodeFilter;
    global.requestAnimationFrame = global.window.requestAnimationFrame = cb =>
      setTimeout(cb);

    buffer = '';
    hasErrored = false;
    fatalError = undefined;

    writable = new Stream.PassThrough();
    writable.setEncoding('utf8');
    writable.on('data', chunk => {
      buffer += chunk;
    });
    writable.on('error', error => {
      hasErrored = true;
      fatalError = error;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function serverAct(callback) {
    await callback();
    // Await one turn around the event loop.
    await new Promise(resolve => {
      setImmediate(resolve);
    });
    if (hasErrored) {
      throw fatalError;
    }
    const bufferedContent = buffer;
    buffer = '';
    if (bufferedContent !== '') {
      const temp = document.createElement('body');
      temp.innerHTML = bufferedContent;
      await insertNodesAndExecuteScripts(temp, container, null);
      jest.runAllTimers();
    }
    return bufferedContent;
  }

  it('emits declarative pending Suspense markers without a B: template', async () => {
    const promise = new Promise(() => {});
    function Never() {
      throw promise;
    }

    const shell = await serverAct(async () => {
      const {pipe} = ReactDOMFizzServer.renderToPipeableStream(
        <div>
          <Suspense fallback="Loading">
            <Never />
          </Suspense>
        </div>,
        {
          onError() {},
        },
      );
      pipe(writable);
    });

    expect(shell).toContain('<!--$?--><?start name="B:');
    expect(shell).toContain('">Loading<?end><!--/$-->');
    expect(shell).not.toContain('<template id="B:');
  });

  it('completes boundaries with template for and $RP when there are no styles', async () => {
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

    expect(shell).toContain('<!--$?--><?start name="B:');
    expect(shell).toContain('">Loading<?end><!--/$-->');
    expect(shell).not.toContain('<template id="B:');
    expect(shell).not.toContain('<div hidden id="S:');

    const completion = await serverAct(async () => {
      resolve('Done');
    });

    expect(completion).toContain('<template for="B:');
    expect(completion).toContain('<?marker name="B:');
    expect(completion).toContain('$RP("B:');
    expect(completion).not.toContain('<div hidden id="S:');
    expect(completion).not.toContain('$RC("');
  });

  it('flips pending Suspense comments to completed via $RP', async () => {
    const {
      completeBoundaryDeclarative,
    } = require('react-dom-bindings/src/server/fizz-instruction-set/ReactDOMFizzInstructionSetShared');

    const startComment = document.createComment('$?');
    const content = document.createElement('span');
    content.textContent = 'content';
    const markerComment = document.createComment('?marker name="B:0"');
    const endComment = document.createComment('/$');
    container.appendChild(startComment);
    container.appendChild(content);
    container.appendChild(markerComment);
    container.appendChild(endComment);

    let retried = false;
    startComment._reactRetry = () => {
      retried = true;
    };

    completeBoundaryDeclarative('B:0');

    expect(startComment.data).toBe('$');
    expect(markerComment.parentNode).toBe(null);
    jest.runAllTimers();
    expect(retried).toBe(true);
  });
});
