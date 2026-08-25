/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Default for source/jest and Node builds used with react-dom/server:
// rejected thenable so HTML rendering bails to the browser.
// Browser-targeted bundles fork to ReactDOMBrowser.client.js via
// scripts/rollup/forks.js.
export {browser} from './ReactDOMBrowser.server';
