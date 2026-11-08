# [Flight] HTML-first initial load: stop shipping what Fizz already rendered (`enableFlightHtmlFirst`)

Stacked on #12 → #13 host elision → #14 lazy reply → #15 dedupe. Off by default, ~175 lines of library code, nothing changes unless a framework opts in.

## Problem
An RSC page's first response carries the same content twice: Fizz HTML for the
browser to paint, and an inlined Flight payload the browser needs to hydrate. For
static content (inline CSS, JSON-LD, markup) and for client components that do
nothing in the browser, the second copy is dead weight, and it is also work for
the server (serialize, tee, parse).

## What this adds (all behind `enableFlightHtmlFirst`)
1. **Elide `<style>` and data-block `<script>`** (`ld+json`/`json`, no src/async).
   Big strings inside an elided row stay in that row, never in the main stream.
2. **`unstable_pruneForBrowser(value[, tag])`**:
   - value: browser gets `undefined`, SSR gets the real value (props the browser never needs).
   - element + host tag: a client element the browser doesn't run. Browser gets a stub that adopts the server DOM.
   - A host region is collapsed only if everything in it is static or pruned. An unpruned (interactive) client component keeps its host skeleton + props and **hydrates normally**.
3. **`onElidedValue(id, value)`**: in-process SSR takes the live node instead of JSON:
   no stringify on the server, no parse in the client, and the module row of a stubbed component never reaches the browser.

Initial-load only: elision happens only when the framework passes
`onElidedRow`/`onElidedValue`. Navigation/refetch responses are ordinary full Flight.

## Results (real Chromium, 1000-row page: inline CSS 244KB + JSON-LD 143KB + static chrome + 1000 table rows, every 100th row interactive)
| | today | this PR |
|---|---|---|
| HTML bytes | 1,697,853 | **1,085,345** (visual-only Fizz floor: 1,068,303) |
| HTML gzip | 141,102 | **73,616** |
| inlined Flight | 627,528 | **15,021** |
| hydration committed (in-page timestamp, median of 9) | 130 ms | **114 ms** |

Server render, same page, median ms (interleaved in-process, `yarn bench:inproc`):
pure Fizz floor 9.4 · today 14.3 · this PR (JSON rows) 13.7 · **this PR (live rows) 10.8**.
Stateless-row table: 10.3 vs 10.0 pure Fizz.

## Correctness
- Real browser (`yarn e2e`): hydration adopts the **same DOM nodes** (1000/1000 rows, `<style>`, JSON-LD), zero console warnings, zero recoverable errors, interactive counters (top-level and mid-table) work, client navigation fetches full content and replaces the stubs.
- jest (`ReactFlightDOMBrowserHtmlFirst-test`, 9 tests): leakage, resources/executable scripts not elided, whole-document + Suspense hydration, pruning, interactive hand-off, live rows, taint on live rows.
- Every binding x entry: `node fixtures/flight-ssr-bench/e2e/bindings-smoke.js` (JSON rows, live rows, prune, inline fallback) passes for webpack, turbopack, parcel, unbundled, esm; Flow passes for all 16 DOM renderers.
- eslint clean; Flight tests of all five bindings, react-client and react-server pass on experimental, stable, www-modern and www-classic.

## Contract (what a framework / author has to know)
- `unstable_pruneForBrowser(element, tag)` is an author assertion that the component does nothing in the browser (no state, handlers, effects). A wrong assertion gives UI that looks right but is inert. Follow-up: a build-time "static client module" flag so frameworks apply this automatically.
- `onElidedValue` is for in-process SSR: the framework resolves client references in the live node with the manifest it already holds (`fixtures/flight-ssr-bench/render-helpers.js` has the 40-line reference resolver). `onElidedRow` (JSON) remains for out-of-process consumers.
- Stubs adopt server DOM. If a boundary is client-rendered instead (e.g. regenerated after a hydration mismatch), the stub throws a clear error so the app's error boundary can refetch, rather than rendering blank content.
- Wired into every server binding: webpack, turbopack, parcel, unbundled, esm (`node`, `browser`, `edge` entries where they exist). `react-server-dom-fb` calls `createRequest` positionally and takes the new trailing parameters unchanged, but is not wired here.

## Not in scope / next
Auto static-client detection; pruning scalar props; routing more rows through live handoff for Suspense-streamed content.

## Known limits
- Chromium only (Firefox/WebKit not run). The fixture mixes a production RSC bundle with a dev client in dev mode, so its key warnings are fixture noise (the baseline emits them too).
- The "today" column is the stack tip with dedupe on and elision off, so it understates the original payload.
- 3 `ReactFlightDOMNode-test` Buffer-pool tests fail on the stack base as well (Node 26). `ReactFlightAsyncDebugInfo-test` ("can track async file reads") failed intermittently on the base and on this branch.
