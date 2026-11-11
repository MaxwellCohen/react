# [Flight] HTML-first initial load: don't re-ship static server output (`enableFlightStaticHostElision`)

Single flag (`enableFlightStaticHostElision`). Orthogonal to upstream Flight dedupe work; this branch does not include a separate dedupe or lazy-parser flag. Off by default. When on, a request elides only if the framework passes `elideStaticHosts: true` on the Flight render that feeds HTML SSR (internal registry, no `elidedRows` side channel); without it nothing is elided, so navigation / refetch / action responses need no change. `elideStaticHosts: {onRow, onValue}` remains for custom / out-of-process sinks.

**Scope: static Server Component host output in host position.** That includes Suspense children and Client Component `children` (layouts / slots). Client components themselves are never elided: they keep full props in Flight and hydrate normally. Non-`children` props (e.g. `panels`, `fallback`) stay in the payload.

## Problem
An RSC page's first response carries the same content twice: Fizz HTML for the
browser to paint, and an inlined Flight payload the browser needs to hydrate. For
static markup that a Server Component renders (inline CSS, JSON-LD, plain
host elements) the second copy is dead weight, and it is also work for the
server (serialize, tee, parse).

## What this adds (all behind `enableFlightStaticHostElision`)
1. **Elide static host subtrees in host position** — direct host children of host
   elements, Suspense children, Client Component `children`, and the entries of a root
   element map (`{page, layout, …}`), only when every
   node in the region is static (primitive props, no `ref`). Tags that need client
   identity (`form`, `input`, `img`, `svg`, `title`, `link`, `meta`, …) are never
   elided; `<style>` without precedence+href and JSON/ld+json data `<script>` blocks
   may be. Big strings inside an elided row stay in that row, never in the main stream.
2. **One request option, no side channel for in-process SSR:** with the flag on, a
   request elides only if the framework passes `elideStaticHosts: true` (the response that
   feeds SSR). Flight then stores elided rows in a `globalThis` registry, emits a
   `:Q<id>` row, and the first in-process `createFrom*` claims them for SSR. The
   browser isolate has an empty registry and adopts HTML stubs (hydration). Without
   the option nothing is elided, so a response that goes straight to the browser
   can never be elided by accident.
3. **`elideStaticHosts: {onValue(id, value), onRow(id, json)}`:** overrides for
   out-of-process or custom sinks (live node vs JSON). Same taint checks as the
   JSON path.
4. Fix: elided rows of keyed Server Components with array children no longer recurse forever
   (the key context is consumed by the row root, like a finished render does).

A host region is elided only if everything in it is static host output. A region that contains a client
component keeps its host skeleton and the client component keeps its props; only its static
host siblings / `children` slots are elided when they qualify.

Initial-load: the framework passes `elideStaticHosts: true` on the Flight render that feeds SSR.
Flight elides into an internal registry keyed by a `:Q…` row in the stream; the first
in-process `createFrom*` claims it for SSR, later consumers (browser) get stubs and adopt
HTML. `elideStaticHosts: {onRow, onValue}` remains for out-of-process consumers.
Navigation/refetch responses simply do not opt in. On navigation the full payload has real elements where the stubs were, so react-dom
**re-creates** those regions from the payload (the old DOM is not trusted: the new page may differ)

## Results
### 41-scenario corpus (tip `8dd5e5f61d`, flag off vs on, full size)
Sum across pages (whole-document gzip/brotli; Flight = inlined `<script>` payload bytes):

| Metric | Stock (flag off) | Flag on | Change |
|---|---:|---:|---:|
| Gzip download | 1,023,890 | 586,846 | **−42.7%** |
| Raw HTML | 14,555,561 | 7,252,811 | **−50.2%** |
| Inlined Flight | 9,280,601 | 1,977,851 | **−78.7%** |
| Brotli | 479,331 | 286,455 | **−40.2%** |

See [SCENARIOS.md](./SCENARIOS.md) and `yarn scenarios:metrics`. Aggregate savings are dominated by a few heavy pages; median per-page gzip change is smaller. Some pages show little or no gzip win (`all-client`, non-`children` props like `tabs-panels-prop`, or gzip-worse cases like `repeated-long-strings`).

### Framework throughput (Waku host-row page, 1000 rows, 5 rotated rounds)
Waku was the measurement vehicle because it is easy to patch and has strong RSC support; nothing here is Waku-specific.
Waku's Flight model is a root element map (`{page, layout, …}`); entries of a root plain-object model stay in host position, so it elides.

| | stock | flag on, stock Waku | flag on + one-line opt-in (`elideStaticHosts: true`) |
|---|---:|---:|---:|
| req/s | 1.00 | 1.01 | **3.19×** (3.15–3.24) |
| TTFB | 1.00 | 0.99 | **0.48×** |
| inlined Flight | 823,655 B | 823,655 B | 18,978 B (−97.7%) |
| gzip HTML | 130,459 B | 130,466 B | 60,883 B (−53.3%) |

Stock Waku with the flag on is byte-identical to stock and navigates correctly (forgetting the option means no win, not a broken page).
All variants: hydrate, interactive counters, 0 console errors, SPA navigation fetches the full payload (602,063 B). Waku patch: `MaxwellCohen/wakujs` branch `rsc-html-first-optin`.
Not measured: Next.js (the opt-in there would be `elideStaticHosts: true` when the request is not an RSC request).

### 1000-row page (historical Chromium table)
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
- Scenario corpus (`yarn scenarios:check --size full --variants off,all --browser chromium|firefox|webkit`): hydrated + interacted DOM vs flags-off, plus SPA navigation with a full (non-opted-in) Flight payload. Chromium is **41/41** at `8dd5e5f61d` — registry SSR applies Flight `:HL` preload hints into Fizz (pinned `currentRequest` across suspended work + duplicate hint forward) matching flags-off / side-channel.
- Real browser (`yarn e2e`): hydration adopts the **same DOM nodes** (1000/1000 rows, `<style>`, JSON-LD), zero console warnings, zero recoverable errors, interactive counters (top-level and mid-table) work, client navigation fetches full Flight and re-creates the elided regions with the new content.
- jest (`ReactFlightDOMBrowserStaticHostElision-test`, HostElision suites): leakage, resources/executable scripts not elided, whole-document + Suspense hydration, client components keep full props, interactive hand-off, live rows, keyed array-children rows, taint on live rows, navigation to different content, root element maps.
- Every binding x entry: `node fixtures/flight-ssr-bench/e2e/bindings-smoke.js` (JSON rows, live rows, inline fallback) for webpack, turbopack, parcel, unbundled, esm.

## Contract (what a framework has to know)
- **The one framework change:** ship a React build with the flag on and pass `elideStaticHosts: true` on the Flight render that feeds HTML SSR. `renderToReadableStream` → tee → `createFrom*` → Fizz then needs no `elidedRows`. The stream carries a `:Q<id>` row; SSR claims the registry; the browser isolate has an empty registry and adopts HTML.
- **Everything else is unchanged and safe by default:** navigation, refetch and action responses do not opt in, so they are full Flight payloads. The framework already distinguishes them (Waku: the `RSC/` URL prefix; Next.js: the `RSC: 1` header).
- `elideStaticHosts: {onRow, onValue}` remains for out-of-process or custom sinks (the client takes the rows as `elidedHostRows`).
- Stubs adopt server DOM. If a boundary is client-rendered instead (e.g. deferred mount, regenerated after a hydration mismatch), call `onElidedContentMissing` to recover (typically refetch). Without that callback, the stub suspends and reports an uncaught error rather than rendering blank content.
- Large strings passed as client props are ordinary Flight strings. To keep CSS/JSON-LD out of Flight, render it from a Server Component as a direct `<style>` / `<script type="application/ld+json">`.
- Wired into webpack / edge / browser / Node (and turbopack, parcel, unbundled, esm) server bindings. All bundler packages type the option as `boolean | (id, json) => void`.

## Not in scope / next
Eliding client components (needs an author or build-time guarantee that the component does nothing in the browser, deliberately not part of this PR); collapsing runs of server-rendered sibling rows into one elided row (each server row is its own `$J` ref today).

## Known limits
- Corpus browsers: Chromium re-verified at tip (**41/41** including `head-hoistables`); Firefox/WebKit were green on earlier tips — re-run after the `:HL` fix. The fixture mixes a production RSC bundle with a dev client in dev mode, so its key warnings are fixture noise (the baseline emits them too).
- 3 `ReactFlightDOMNode-test` Buffer-pool tests fail on the stack base as well (Node 26). `ReactFlightAsyncDebugInfo-test` ("can track async file reads") failed intermittently on the base and on this branch.
- Framework host-page throughput: tip + zero-optin Waku (`3ae8a1410b` / `908ab031`) is **≈1.02×** vs stock (within noise) — host rows / CSS / JSON-LD are not elided under Waku’s elements-map after host-position scoping. The older ~3× (`6ed2e62d21`, multi-flag + explicit opt-in) does not reproduce; do not quote it as current.
