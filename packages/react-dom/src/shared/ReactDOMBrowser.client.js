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

const browserImpl = function browser(
  // Reason is only used when rendering HTML on the server.
  reason?: ReactRecoverableReason,
): Thenable<void> {
  const thenable: Thenable<void> = Promise.resolve(undefined);
  thenable.status = 'fulfilled';
  thenable.value = undefined;
  return thenable;
};

export const browser:
  | ((reason?: ReactRecoverableReason) => Thenable<void>)
  | void = enableBrowserAPI ? browserImpl : undefined;
