/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Re-run the host elision, payload dedupe, elision + dedupe and lazy parser suites
// with every prototype flag on
// at once, to catch interactions between the features.
// Each suite below mocks only its own flag. Requiring them registers those
// mocks, so re-register the combined mock afterwards: the last factory wins when
// the suites load shared/ReactFeatureFlags in their beforeEach.
require('./ReactFlightDOMBrowserHostElision-test');
require('./ReactFlightDOMBrowserPayloadDedupe-test');
require('./ReactFlightDOMBrowserElisionDedupe-test');
require('./ReactFlightDOMBrowserLazyParser-test');

jest.doMock('shared/ReactFeatureFlags', () => ({
  ...jest.requireActual('shared/ReactFeatureFlags'),
  enableFlightHostElision: true,
  enableFlightPayloadDedupe: true,
  enableFlightLazyClientParser: true,
  enableFlightLazyTypedArrays: true,
  enableFizzDeclarativePatching: true,
}));

describe('combined prototype flags', () => {
  it('enables every prototype flag for the suites above', () => {
    jest.resetModules();
    const flags = require('shared/ReactFeatureFlags');
    expect(flags.enableFlightHostElision).toBe(true);
    expect(flags.enableFlightPayloadDedupe).toBe(true);
    expect(flags.enableFlightLazyClientParser).toBe(true);
    expect(flags.enableFizzDeclarativePatching).toBe(true);
  });
});
