/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// enableFlightStaticHostElision: in-process Flight → SSR without framework callbacks.
// The server registers elided rows under a request id emitted in the stream
// (`:Q…`). The first createFrom* in this isolate claims the map; later
// consumers (browser / second tee branch) see stubs and adopt SSR HTML.
//
// Stored on globalThis so Flight server and client share one map even when
// bundlers or tests load them as separate module graphs (jest.resetModules).

type ElidedRowMap = Map<number, mixed>;

type ElidedRowsStore = {
  nextId: number,
  pending: Map<number, ElidedRowMap>,
};

const STORE_KEY = '__REACT_FLIGHT_ELIDED_ROWS_REGISTRY__';

function getStore(): ElidedRowsStore {
  // $FlowFixMe[cannot-resolve-name] globalThis
  const root: any = typeof globalThis !== 'undefined' ? globalThis : global;
  let store: void | ElidedRowsStore = root[STORE_KEY];
  if (store === undefined) {
    store = {nextId: 1, pending: new Map()};
    root[STORE_KEY] = store;
  }
  return store;
}

export function allocateElidedRowsRegistry(): {
  requestId: number,
  rows: ElidedRowMap,
} {
  const store = getStore();
  const requestId = store.nextId++;
  const rows: ElidedRowMap = new Map();
  store.pending.set(requestId, rows);
  return {requestId, rows};
}

export function claimElidedRowsRegistry(
  requestId: number,
): void | ElidedRowMap {
  const store = getStore();
  const rows = store.pending.get(requestId);
  if (rows !== undefined) {
    store.pending.delete(requestId);
  }
  return rows;
}

export function releaseElidedRowsRegistry(requestId: number): void {
  getStore().pending.delete(requestId);
}

// An entry is normally removed when a createFrom* claims it. If nothing ever
// does (the response only goes to a browser, or SSR failed before it read the
// first bytes) the rows, which are live React elements, would stay here forever.
// So the entry is also released once the Flight request that owns it has been
// garbage collected. The request stays reachable for as long as the stream it
// feeds can still be read, so this cannot drop rows a consumer still needs.
// The owner must not be referenced from the entry.
const releaseWhenCollected: null | FinalizationRegistry<number> =
  // $FlowFixMe[cannot-resolve-name]
  typeof FinalizationRegistry === 'function'
    ? // $FlowFixMe[cannot-resolve-name]
      new FinalizationRegistry(releaseElidedRowsRegistry)
    : null;

export function releaseElidedRowsWhenCollected(
  owner: interface {},
  requestId: number,
): void {
  if (releaseWhenCollected !== null) {
    releaseWhenCollected.register(owner, requestId);
  }
}
