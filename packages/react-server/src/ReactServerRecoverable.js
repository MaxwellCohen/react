/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactRecoverableReason} from 'shared/ReactTypes';

import {REACT_RECOVERABLE_TYPE} from 'shared/ReactSymbols';

const browserReasonInitializationFallback =
  'The reason for browser-only rendering could not be determined because its ' +
  'initializer threw.';

export function createRecoverableError(reason?: ReactRecoverableReason): Error {
  let initializedReason;
  if (typeof reason === 'function') {
    try {
      initializedReason = reason();
    } catch {
      // A reason is only diagnostic metadata. Its initializer must not affect
      // whether the renderer can defer this subtree to the browser.
      initializedReason = browserReasonInitializationFallback;
    }
  } else {
    initializedReason = reason;
  }
  // Always create the recoverable at the consumption point so its stack
  // identifies the relevant use() or abort() call. A lazy reason is diagnostic
  // metadata and can be any value supported by Error.cause.
  const error = new Error(
    'Browser-only rendering was requested by `browser()`.',
    reason === undefined ? undefined : {cause: initializedReason},
  );
  Object.defineProperty(error, REACT_RECOVERABLE_TYPE, {value: true});
  return error;
}
