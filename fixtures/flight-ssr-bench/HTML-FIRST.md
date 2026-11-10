# [Flight] HTML-first initial load: don't re-ship static server output (`enableFlightHtmlFirst`)

Single flag (`enableFlightHtmlFirst`). Orthogonal to upstream Flight dedupe work; this branch does not include a separate dedupe or lazy-parser flag. Off by default; nothing changes unless a framework opts in.

**Scope: server-component output only.** Client components are never elided, pruned or stubbed: they keep their full props in Flight and hydrate normally.

## Problem
An RSC page's first response carries the same content twice: Fizz HTML for the
browser to paint, and an inlined Flight payload the browser needs to hydrate. For
static markup that a Server Component renders (inline CSS, JSON-LD, plain
host elements) the second copy is dead weight, and it is also work for the
server (serialize, tee, parse).

## What this adds (all behind `enableFlightHtmlFirst`)
1. **Elide `<style>` and data-block `<script>`** that a Server Component emits directly as host elements
   (`type=application/ld+json|json`, no src/async; `<style>` without precedence+href).
   Big strings inside an elided row stay in that row, never in the main stream.
2. **`onElidedValue(id, value)`**: in-process SSR takes the live host-element node instead of JSON:
   no stringify on the server, no parse in the client. Rows only ever hold server-component output
   (host elements and text), never client elements, and the live path applies the same taint checks as JSON rows.
3. Fix: elided rows of keyed Server Components with array children no longer recurse forever
   (the key context is consumed by the row root, like a finished render does).

A host region is elided only if everything in it is static host output. A region that contains a client
component keeps its host skeleton and the client component keeps its props; only its static
host siblings are elided.

Initial-load only: elision happens only when the framework passes
`onElidedRow`/`onElidedValue`. Navigation/refetch responses are ordinary full Flight, and
an elided region **remounts** (fresh DOM from the full payload) on the first client navigation.

## Results (real Chromium, 1000-row page: inline CSS 244KB + JSON-LD 143KB + static chrome + 1000 table rows, every 100th row an interactive Counter)
See [BENCH-RESULTS-server-only.md](./BENCH-RESULTS-server-only.md) for the full tables, before/after against the
pruning version, and which numbers moved and why. Summary:

| rows are... | flag | HTML bytes | gzip | inlined Flight |
|---|---|---|---|---|
| client components | off | 1,697,853 | 141,102 | 627,528 |
| client components | on | 1,284,218 | 96,943 | 213,894 |
| server components | off | 2,801,334 | 156,090 | 1,729,029 |
| server components | on | **1,087,295** (visual-only Fizz floor: 1,068,303) | **74,282** | **16,971** |

CSS and JSON-LD elide in both on-rows (server-rendered); client rows stay in Flight (they need their props to hydrate).

## Correctness
- Real browser (`yarn e2e`): hydration adopts the **same DOM nodes** (1000/1000 rows, `<style>`, JSON-LD), zero console warnings, zero recoverable errors, interactive counters (top-level and mid-table) work, client navigation fetches full content and replaces the stubs.
- jest (`ReactFlightDOMBrowserHtmlFirst-test`, 9 tests): leakage, resources/executable scripts not elided, whole-document + Suspense hydration, client components keep full props, interactive hand-off, live rows, keyed array-children rows, taint on live rows.
- Every binding x entry: `node fixtures/flight-ssr-bench/e2e/bindings-smoke.js` (JSON rows, live rows, inline fallback) for webpack, turbopack, parcel, unbundled, esm.

## Contract (what a framework has to know)
- `onElidedValue` is for in-process SSR: the framework passes the live node to its SSR client (`fixtures/flight-ssr-bench/render-helpers.js` has the resolver; with server-only rows it has nothing to resolve). `onElidedRow` (JSON) remains for out-of-process consumers.
- Stubs adopt server DOM. If a boundary is client-rendered instead (e.g. regenerated after a hydration mismatch), the stub throws a clear error so the app's error boundary can refetch, rather than rendering blank content. (This is the base host-elision behavior, unchanged.)
- Large strings passed as client props are ordinary Flight strings. To keep CSS/JSON-LD out of Flight, render it from a Server Component as a direct `<style>` / `<script type="application/ld+json">`.
- Wired into every server binding through the `onElidedRow`/`onElidedValue` options: webpack, turbopack, parcel, unbundled, esm. `react-server-dom-fb` calls `createRequest` positionally and takes the new trailing parameters unchanged, but is not wired here.

## Not in scope / next
Eliding client components (needs an author or build-time guarantee that the component does nothing in the browser, deliberately not part of this PR); collapsing runs of server-rendered sibling rows into one elided row (each server row is its own `$J` ref today); routing more rows through live handoff for Suspense-streamed content.

## Known limits
- Chromium only (Firefox/WebKit not run). The fixture mixes a production RSC bundle with a dev client in dev mode, so its key warnings are fixture noise (the baseline emits them too).
- 3 `ReactFlightDOMNode-test` Buffer-pool tests fail on the stack base as well (Node 26). `ReactFlightAsyncDebugInfo-test` ("can track async file reads") failed intermittently on the base and on this branch.
