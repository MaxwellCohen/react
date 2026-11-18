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

// Shared by the Flight request that elided the rows and the consumer that
// claimed them to render HTML.
export type ElidedRowsEntry = {
  rows: ElidedRowMap,
  // Ids of the rows the claimer actually rendered. The HTML for the others was
  // never produced (children of a closed modal, a client-only wrapper), so the
  // server writes those to the stream after all ("late rows").
  rendered: Set<number>,
  claimed: boolean,
  // Set by the server while it keeps the stream open for late rows. Called by
  // the claimer once it has rendered what it is going to render.
  settle: null | (() => void),
};

type ElidedRowsStore = {
  nextId: number,
  pending: Map<number, ElidedRowsEntry>,
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
  entry: ElidedRowsEntry,
} {
  const store = getStore();
  const requestId = store.nextId++;
  const entry: ElidedRowsEntry = {
    rows: new Map(),
    rendered: new Set(),
    claimed: false,
    settle: null,
  };
  store.pending.set(requestId, entry);
  return {requestId, entry};
}

export function claimElidedRowsRegistry(
  requestId: number,
): void | ElidedRowsEntry {
  const store = getStore();
  const entry = store.pending.get(requestId);
  if (entry !== undefined) {
    store.pending.delete(requestId);
    entry.claimed = true;
  }
  return entry;
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
