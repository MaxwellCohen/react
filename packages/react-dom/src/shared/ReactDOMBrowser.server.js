/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactRecoverableReason, Thenable} from 'shared/ReactTypes';

import {enableBrowserAPI} from 'shared/ReactFeatureFlags';
import {REACT_RECOVERABLE_TYPE} from 'shared/ReactSymbols';

const browserReasonInitializationFallback =
  'The reason for browser-only rendering could not be determined because its ' +
  'initializer threw.';

// Kept next to the server thenable so `.reason` can be read by Fizz/Flight
// unwrap without a react-server import into the react-dom graph. abort() still
// uses createRecoverableError from react-server with `_reason`.
function createRejectedBrowserReason(reason?: ReactRecoverableReason): Error {
  let initializedReason;
  if (typeof reason === 'function') {
    try {
      initializedReason = reason();
    } catch {
      initializedReason = browserReasonInitializationFallback;
    }
  } else {
    initializedReason = reason;
  }
  const error = new Error(
    'Browser-only rendering was requested by `browser()`.',
    reason === undefined ? undefined : {cause: initializedReason},
  );
  Object.defineProperty(error, REACT_RECOVERABLE_TYPE, {value: true});
  return error;
}

const browserImpl = function browser(
  reason?: ReactRecoverableReason,
): Thenable<void> {
  // Rejected thenable. Fizz/Flight throw `.reason` like any rejected promise.
  // `$$typeof` / `_reason` remain for abort(). Lazy non-enumerable `reason` so
  // `throw browser()` does not eagerly initialize during error serialization.
  const thenable: any = {
    $$typeof: REACT_RECOVERABLE_TYPE,
    _reason: reason,
    status: 'rejected',
    then(
      _onFulfilled: void | (void => mixed),
      onRejected: void | (mixed => mixed),
    ) {
      if (typeof onRejected === 'function') {
        onRejected(thenable.reason);
      }
    },
  };
  Object.defineProperty(thenable, 'reason', {
    configurable: false,
    enumerable: false,
    get(): Error {
      return createRejectedBrowserReason(reason);
    },
  });
  return thenable;
};

export const browser:
  | ((reason?: ReactRecoverableReason) => Thenable<void>)
  | void = enableBrowserAPI ? browserImpl : undefined;
