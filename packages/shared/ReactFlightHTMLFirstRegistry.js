/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// enableFlightHTMLFirst: in-process Flight → SSR without framework callbacks.
// The server registers stubbed rows under a request id emitted in the stream
// (`:P…`). The first createFrom* in this isolate claims the map; later
// consumers (browser / second tee branch) see stubs and adopt SSR HTML.
//
// Stored on globalThis so Flight server and client share one map even when
// bundlers or tests load them as separate module graphs (jest.resetModules).

type StubbedRowMap = Map<number, mixed>;

// Shared by the Flight request that stubbed the rows and the consumer that
// claimed them to render HTML.
export type StubbedRowsEntry = {
  rows: StubbedRowMap,
  // Ids of the rows the claimer actually rendered. The HTML for the others was
  // never produced (children of a closed modal, a client-only wrapper), so the
  // server writes those to the stream after all ("late rows").
  rendered: Set<number>,
  claimed: boolean,
  // Set by the server while it keeps the stream open for late rows. Called by
  // the claimer once it has rendered what it is going to render.
  settle: null | (() => void),
};

type StubbedRowsStore = {
  pending: Map<number, StubbedRowsEntry>,
};

// A symbol, so an element id in the document cannot clobber it.
const STORE_KEY = Symbol.for('react.flight_html_first_registry');

function getStore(): StubbedRowsStore {
  // $FlowFixMe[cannot-resolve-name] globalThis
  const root: any = typeof globalThis !== 'undefined' ? globalThis : global;
  let store: any = root[STORE_KEY];
  if (
    store === null ||
    typeof store !== 'object' ||
    !(store.pending instanceof Map)
  ) {
    store = {pending: new Map()};
    root[STORE_KEY] = store;
  }
  return store;
}

// The id is written to the stream and names the payload in every process that
// reads it, so it must not repeat across servers or restarts (a browser would
// mix up the nodes of two payloads) and must not be guessable (a stream from
// elsewhere could claim another request's rows). Non-zero, at most 2^53 - 1.
function randomRequestId(): number {
  // $FlowFixMe[cannot-resolve-name]
  const crypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  let high, low;
  if (crypto != null && typeof crypto.getRandomValues === 'function') {
    const words = crypto.getRandomValues(new Uint32Array(2));
    high = words[0] & 0x1fffff;
    low = words[1];
  } else {
    high = Math.floor(Math.random() * 0x200000);
    low = Math.floor(Math.random() * 0x100000000);
  }
  return high * 0x100000000 + low;
}

export function allocateStubbedRowsRegistry(): {
  requestId: number,
  entry: StubbedRowsEntry,
} {
  const store = getStore();
  let requestId = randomRequestId();
  while (requestId === 0 || store.pending.has(requestId)) {
    requestId = randomRequestId();
  }
  const entry: StubbedRowsEntry = {
    rows: new Map(),
    rendered: new Set(),
    claimed: false,
    settle: null,
  };
  store.pending.set(requestId, entry);
  return {requestId, entry};
}

export function claimStubbedRowsRegistry(
  requestId: number,
): void | StubbedRowsEntry {
  const store = getStore();
  const entry = store.pending.get(requestId);
  if (entry !== undefined) {
    store.pending.delete(requestId);
    entry.claimed = true;
  }
  return entry;
}

export function releaseStubbedRowsRegistry(requestId: number): void {
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
      new FinalizationRegistry(releaseStubbedRowsRegistry)
    : null;

export function canReleaseStubbedRowsWhenCollected(): boolean {
  return releaseWhenCollected !== null;
}

export function releaseStubbedRowsWhenCollected(
  owner: interface {},
  requestId: number,
): void {
  if (releaseWhenCollected !== null) {
    releaseWhenCollected.register(owner, requestId);
  }
}

// Rendered in place of a stub by the consumer that claimed the rows (the one
// that renders HTML), in the slot StaticStub takes in the browser. It is a lazy
// node: Fizz resolves it only when it renders that position, which records
// that the HTML contains this row. A lazy node costs far less than a component
// render per row.
export type StubbedRenderedPayload = {
  entry: StubbedRowsEntry,
  requestId: number,
  id: number,
  model: any,
};

export function initStubbedRendered(payload: StubbedRenderedPayload): any {
  payload.entry.rendered.add(payload.id);
  return payload.model;
}

// Fizz skips an element that the prelude of a resumed render already contains,
// without resolving what is inside it. The stubs among its host-position
// children are in that HTML all the same, so Fizz calls this for each lazy it
// finds there. It never initializes a lazy that is not one of ours.
export function markStubbedRendered(node: any): void {
  if (node._init === initStubbedRendered) {
    const payload: StubbedRenderedPayload = node._payload;
    payload.entry.rendered.add(payload.id);
  }
}

// Fizz writes this as a comment before the DOM of a stub it rendered, so that
// a browser that has to render the stub without DOM to adopt (React discarded
// it) can still find it. It names the payload and the row, like the key of the
// node the browser keeps for the stub, and is null for any other lazy.
export function getStubbedRenderedMarker(node: any): null | string {
  if (node._init === initStubbedRendered) {
    const payload: StubbedRenderedPayload = node._payload;
    return getStubbedRowMarker(payload.requestId, payload.id);
  }
  return null;
}

// Base 36: the marker is written once per stub.
export function getStubbedRowMarker(requestId: number, id: number): string {
  return requestId.toString(36) + '.' + id.toString(36);
}
