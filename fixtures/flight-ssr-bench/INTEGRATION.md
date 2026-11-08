# Integration: Flight host elision + payload dedupe + lazy Flight client + Fizz declarative patching

Branch: `t3/integrate-flight-fizz-features` (based on main `a58f939795`). Local only, not pushed.

## Commits (cherry-picked in this order)

| Feature | Commits (integrated SHAs) | Source SHAs |
| --- | --- | --- |
| Baseline bench | `a58ade769a` | `191ae40fa6` (= `24d2e4c3c7`, applied once) |
| Host elision | `7b1d352138`, `f226aa509b`, `0adfebbdc1`, `2bb91223cb` | `6067e9a5da`, `26b8a996da`, `1784503ea9`, `c481897198` |
| Lazy Flight client | `cd2a6ed5d7`, `32ca12891c` | `f2564d1ebf`, `e205a55b7e` |
| Fizz declarative patching | `6c6c889b8d` | `323fabc7f1` |
| Payload dedupe | `0334770519`, `b3f36a1a1b` | `ca06b2ca9e`, `32362fc025` (adds `analyze-flight.js`, `RESULTS-payload-dedupe.md`, edits two `ReactFlightDOMEdge` test expectations) |
| Integration fixes | `ec4d9759b2`, `b0d4b1c846`, `71f67806d4`, `7ecffa2660`, the docs/lint commits, and the declarative coordination commit (server batching, `together` lists, whole-boundary flush, error signal; `ReactDOMFizzDeclarativeBatching-test.js`, `declarative-bench.js`) | codes.json newline; combined-flags test; real-browser fixes; elision + dedupe interaction tests |

Dedupe cherry-picked with no conflicts (`ReactFlightServer.js`, flag forks auto-merged). Only real conflict in the lazy step: the `shared/ReactFeatureFlags` import list in `ReactFlightClient.js` (kept both `enableFlightHostElision` and `enableFlightLazyTypedArrays`). Error codes 609/610 come only from the lazy commit, so no renumbering was needed. `codes.json` lost its trailing newline in that commit, restored.

## Flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `enableFlightHostElision` | `__EXPERIMENTAL__` (false in www/native) | Server withholds static host subtrees from the Flight stream and hands them to `onElidedRow`; the SSR client reads them from `elidedRows`. |
| `enableFlightPayloadDedupe` | `__EXPERIMENTAL__` (false in www/native) | Server-only. Strings of 40..1023 chars that repeat are written once into their own row and referenced; references to an object by a path of >= 24 chars are replaced by an outlined row on the second use. |
| `enableFlightLazyClientParser` | false | Moves `encodeReply` out of `client.browser` into `client.browser.reply`, loaded on first use. |
| `enableFlightLazyTypedArrays` | false | Defers typed array rows to `client.browser.parser` (buffer and replay). Net size loss today (about 0.7 KB saved vs 1.5 KB of buffering code); groundwork only. |
| `enableFizzDeclarativePatching` | `__EXPERIMENTAL__` (false in www/native) | Lets Fizz emit `<?start>`/`<?end>` ranges and `<template for>` completions instead of `$RC` scripts, per request via `unstable_declarativePatching`. Completions are batched on the server (`unstable_declarativeBatchMs`); errored boundaries are signalled with an inert `<template data-rcr>`. |

## Framework-side wiring

- **Elision**
  - Pass `onElidedRow: (id, json) => elidedRows.set(id, json)` to the RSC server render, collecting into a `Map`.
  - Pass `{elidedRows}` to the SSR `createFromNodeStream` (and the Edge/Browser equivalents).
  - Inline only the main Flight stream into the HTML. Elided rows must never reach the browser stream, or the savings vanish.
  - See `render-helpers.js` (`opts.elide`) and the `e-server-host-elided` variant in `bench-table.js`.
- **Payload dedupe:** none. It is server-only and the existing client decodes the output (`$N` references to string/object rows).
- **Lazy client**
  - Pass `unstable_loadReplyEncoder: () => import('react-server-dom-webpack/client.browser.reply')` to `encodeReply`/`createFromReadableStream`.
  - Pass `unstable_loadParserExtension: () => import('react-server-dom-webpack/client.browser.parser')` (typed arrays flag only).
  - Use literal `import()` so the bundler can split the chunks. Without a loader the client throws errors 609/610.
- **Declarative patching**
  - Pass `unstable_declarativePatching: true` to `renderToPipeableStream`, `renderToReadableStream`, and the other Fizz entry points only when the client supports it.
  - Gate on UA or feature detection. Unsupported browsers must get the default `$RC` path, because they would otherwise show a never-completed fallback.
  - Optional `unstable_declarativeBatchMs` (default 300 = the script path's reveal throttle, 0 = only group what completes in one flush). It trades up to 300 ms of reveal delay, and of stream end, for script-path pacing.

## Verification on the integrated branch (all four features)

- Tests, run after the coordination change: `ReactDOMFizz*` (including `ReactDOMFizzDeclarativePatching` and the new `ReactDOMFizzDeclarativeBatching`), `ReactDOMFloat`, `ReactDOMServerPartialHydration`, `ReactMarkup*`, `ReactFlightDOMBrowser*` (including `PayloadDedupe`, `ElisionDedupe`, `CombinedFlags`, `HostElision`, `LazyParser`), `ReactFlightDOMReply/Form/Edge`: 31 suites, 847 tests (817 on stable), in experimental dev/prod, stable dev/prod and www-modern `--variant=false` dev/prod. Every failure is one that also fails on pristine main under Node v26.13.0 (each checked there): the `ReactDOMFizzServer` "very deep trees" stack-overflow tests (prod and sometimes dev), `ReactDOMFizzShellHydration` "recovers from a large component stack during SSR" (all configs), and the `[GATED, SHOULD FAIL] renders a hidden LegacyHidden component` test in `ReactDOMServerPartialHydration` (experimental/stable dev). Nothing else fails.
- `ReactFlightDOMBrowserCombinedFlags-test.js` re-runs the elision, dedupe, elision + dedupe and lazy parser suites with every flag forced on (experimental/www; stable gets a no-op test).
- `ReactFlightDOMBrowserElisionDedupe-test.js` (new): with a long string and a shared style object used both inside an elided subtree and in streamed rows, in both first-sighting orders, every reference in the stripped stream (`$N`, `$L`, `$@`, `$N:path`) resolves to a row inside the stream, none points at an elided id or a `$J` placeholder, SSR HTML is identical to the non-elided render, and hydration from the stripped stream reuses the server DOM. Observed behavior: dedupe outlines the string into a stream row and elided rows reference it; the stream never references an elided row. The shared object is simply inlined in the elided row. The checker itself has a self-test that it flags bad references. No bug found.
- `yarn flow dom-browser|dom-node|dom-legacy`: no errors. `yarn linc`: 0 errors (warnings are "file ignored by default" for fixtures). `yarn prettier`: clean.

## Bench (1000-row table, Node v26.13.0, `NODE_ENV=production`, median of 3 runs)

`yarn build-for-flight-prod`, then in the fixture `yarn copy-modules && NODE_ENV=production node bench-table.js --rows=1000`. Run `copy-modules` after every rebuild: a stale `node_modules` copy silently disables elision.

"All flags on" is a build with elision, dedupe, `enableFlightLazyClientParser`, `enableFlightLazyTypedArrays` and declarative patching on (the lazy flags and declarative patching only matter to browser/Fizz paths; this server-side bench is the SSR + RSC pipeline). "Flags off" is the same tree with elision and dedupe forced off, run in the same session. Bytes are identical in all 3 runs; req/s varies a lot on this machine, so ranges are shown.

| Variant | HTML bytes | HTML gzip | Inlined Flight bytes | Flight gzip | req/s c=1 median (range) | req/s c=10 median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (a) server component + Flight inlined | 2,090,476 | 140,093 | 1,241,253 | 99,132 | 28.9 (24.3-32.6) | 30.5 |
| (d) host-only table, Flight inlined | 594,098 | 45,354 | 453,371 | 30,678 | 41.0 (35.8-56.2) | 44.7 |
| (e) same as (d), elided | 140,946 | 14,373 | 219 | 169 | 82.9 (60.9-95.6) | 82.9 |
| (b) `'use client'` table, no Flight | 140,727 | 14,223 | 0 | - | 286.5 (243.9-311.5) | 227.6 |
| (c) plain Fizz | 140,727 | 14,223 | 0 | - | 341.3 (276.2-375.9) | 266.1 |

Flags off, same session:

| Variant | HTML bytes | HTML gzip | Inlined Flight bytes | Flight gzip | req/s c=1 median (range) | req/s c=10 median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (a) | 2,500,026 | 149,680 | 1,650,803 | 109,089 | 23.4 (22.4-23.8) | 19.9 |
| (d) | 594,098 | 45,354 | 453,371 | 30,678 | 43.1 (38.3-59.1) | 40.8 |
| (e) (nothing to elide) | 594,098 | 45,354 | 453,371 | 30,678 | 52.0 (51.3-57.3) | 48.7 |
| (b) | 140,727 | 14,223 | 0 | - | 268.8 (255.8-293.3) | 257.8 |
| (c) | 140,727 | 14,223 | 0 | - | 276.2 (261.1-342.5) | 273.1 |

What it buys:

- (a) dedupe: HTML -16.4% (gzip -6.4%), inlined Flight -24.8% (gzip -9.1%), req/s c=1 about +20% (23.4 to 28.9, partly noise).
- (d) is unchanged by either flag: its strings are short and it has no repeated long paths.
- (e) elision: HTML -76% (594,098 to 140,946), gzip -68%; inlined Flight 453,371 to 219 B. HTML is within 219 B of plain Fizz (c). req/s c=1 is about 83 vs about 41 for (d) in the same run (roughly 2x), but still about 24% of plain Fizz: SSR still serializes, parses and renders the elided table.
- (b)/(c) are unaffected by the flags (spread there shows the noise floor, roughly +/-15%).

## Declarative patching in a real browser (Chrome 156.0.8078.80, headless, macOS arm64)

`<template for>` / `<?start>` work in this Chrome with **no flags** (checked with default flags, `--enable-experimental-web-platform-features`, and a feature list; same result). Driven with the repo's `playwright-core` 1.51.1 against `/Applications/Google Chrome.app`.

Harness: `declarative-server.js` (+ `declarative-pages.js`, `declarative-client.js`). It needs a build env directory containing `node_modules/{react,react-dom,scheduler}`:

```sh
REACT_ROOT=<dir> REACT_ENV=prod NODE_ENV=production PORT=3011 node declarative-server.js
# GET /?page=basic|nested|css|style|heavy|list|error&mode=decl|script&clientDelay=ms&cssMs=ms&n=boundaries&batchMs=ms&order=forwards|backwards|together
```

Note `scripts/rollup/build.js` wipes `build/`, so copy build output elsewhere (a dev build needs `--type=NODE_DEV` including `react-dom-server-legacy.node`).

Verified (dev build for warnings, prod build for numbers):

1. **No `$RC`/`$RR` scripts.** Only the probe and the bootstrap script remain; every `<template for>` is consumed by the parser. Patches apply and fallbacks are replaced.
2. **Hydration** has no console errors or recoverable errors when the client script arrives before the patches (`clientDelay=0`), between them (900/1000) and after all of them (1500/2500). Server-parsed nodes are preserved (`getElementById(x) === first-seen node`), so React hydrated them rather than client rendering. Clicking a counter 100 ms into hydration of a patched boundary works while `document.readyState` is still `loading`, so the MutationObserver retry fires before `DOMContentLoaded`.
3. **Marker nodes:** `<?start>`/`<?end>` are `ProcessingInstruction` nodes (`nodeType` 7, `target` `start`/`end`), so the PI branch of `isDeclarativePendingMarker` is what runs in a real browser. The bogus-comment branch is only exercised by jsdom. A patch removes both markers; the `<!--$?-->` comment survives and `syncDeclarativelyPatchedBoundary` flips it to `<!--$-->`.
4. **Nested boundaries:** a patch that contains pending inner boundaries brings their own `<!--$?--><?start>` markers, and later patches (including a third level) apply and hydrate with all counters interactive.
5. **Stylesheet gating** (two bugs found and fixed, below).

### Bugs found and fixed

- **Hydration mismatch with inline late styles / stylesheet links.** A patch carries `<style data-precedence>` and `<link rel=stylesheet data-precedence>` inline, so they can be the first hydratable node of a boundary. `getNextHydratable` returned them where a host component was expected, so React reported a mismatch and client-rendered the boundary. Fix: `getNextHydratable` skips them behind `enableFizzDeclarativePatching` (`ReactFiberConfigDOM.js`). Jest test: "hydrates past inline late styles carried by a patch" (fails without the fix).
- **`blocking="render"` link inside the template shows a blank gap.** The UNVERIFIED assumption in the first commit was wrong. Chrome stalls the parser at a body `<link rel=stylesheet>` until it loads, with or without `blocking="render"`. With the link inside the `<template for>`, the stall happens after the boundary's fallback range was already cleared, so the page showed neither the fallback nor the content for the whole CSS load (about 900 ms in the test; screenshot-verified). Fix: write the link before `<template for>`; the stall then delays the whole patch, the fallback stays visible, and the content arrives with the sheet applied (`rgb(0,128,0)` at the first frame). Cost: boundaries patched after the stylesheet link queue behind its load (head-of-line blocking; the script path does not block other boundaries). The `blocking` attribute is kept but was not shown to matter.

- **A declarative boundary could be revealed with only part of its content (found while adding the coordination tests).** `contentRootSegment.parentFlushed` is true, so when a boundary's root segment completes after its fallback flushed while another piece is still pending, `finishedTask` queued the boundary for a partial flush; for declarative boundaries that wrote a `<template for>` with the partial content (plus placeholders and `$RS` scripts for the rest). The script path hides that in a `<div hidden>`; a patch is visible as soon as it is parsed. Fix: declarative boundaries are never queued for partial flush; the content flushes whole once the boundary completes with completed children inlined (`ReactFizzServer.js`). Test: "does not reveal a boundary that only completed partially" (fails without the fix).
- **An errored declarative boundary was only client rendered when the document finished loading.** With a slow sibling boundary that was 1518 ms instead of 311 ms for the script path (`$RX`), and the error digest was lost. Fix below ("Coordination").

## Coordination: what the script path does and what the declarative path does now

The script path coordinates entirely in the client runtime (`fizz-instruction-set`): completions queue in `$RB`; the first reveal waits for the shell's first frame (`requestAnimationFrame`); later reveals are throttled to `FALLBACK_THROTTLE_MS` (300 ms) after the previous reveal (`$RT`), shortened if it would miss `TARGET_VANITY_METRIC` (2300 ms); a batch is revealed in one JS task (`$RV`), optionally inside `startViewTransition`. A `<template for>` patch is applied by the parser the moment it is parsed, so there is nothing client-side to coordinate with. The first prototype therefore had none of this (21 layouts, 25 reveal updates, and an LCP "win" that was only the missing throttle). The server now stands in for the client runtime (`unstable_declarativeBatchMs`, default 300, 0 = group only).

| Behavior | Script path | Declarative before | Declarative now |
| --- | --- | --- | --- |
| Reveal batching | `$RB` queue, one `$RV` JS task per window | one reveal per network chunk, about one per completion | completed boundaries are held and every one queued is written in one flush per window, in queue order. Measured: 3-4 reveal updates / 4-5 layouts vs 2 / 3 for the script path (was 25 / 21). Not atomic: the parser may split a big write over a few tasks. `<link rel=expect blocking=render>` in the body does not make a group atomic in Chrome 156 (tested) |
| First reveal | at the shell's first frame | immediately | completions inside the first frame (about 16 ms, an estimate) go out together; later ones wait until first frame + 300 ms. Measured first reveal 344 ms vs 344 ms |
| Throttle | 300 ms after the previous reveal, measured on the client | none | 300 ms after the previous batch flush, measured on the server. Same constants (a test reads both files). Ignores network latency and the client's paint time |
| Vanity metric (2300 ms) | shortens a throttle that would miss it | none | mirrored using server time since the request started as a stand-in for navigation start |
| Close | stream can end before the last reveal | n/a | the stream stays open until the last held batch is written (up to 300 ms later than script path's end of stream); abort and fatal errors flush immediately |
| Nested boundaries | child patch only after parent is in the document | child patch queued behind parent | same, enforced by queue order; tested for pending inner (separate patches) and for an outlined inner in the same group |
| SuspenseList `forwards`/`backwards` | rows block each other on the server, client batches | same | same row blocking; held boundaries release their row immediately so a list does not take one window per row. Tests compare reveal order with the script path step by step |
| SuspenseList `together` | content is pre-sent hidden, all `$RC`s sent when the last finishes | fell back to script path | all patches queue in the same tick once every boundary is complete and flush as one group, no scripts. The pre-send is lost: the bytes travel at reveal time, not before |
| Partially complete boundary | staged in a hidden container | revealed partially (bug) | flushed whole when complete |
| Stylesheet gating | `$RR` waits for that boundary's sheets, other boundaries reveal | link inside template: blank gap (bug); then link before template | link before template: the parser stalls, the fallback stays and the content arrives styled. Not solved: everything queued behind it waits too (head-of-line) |
| Error / client rendered boundary | `$RX` flips the comment to `$!` with digest/message, React retries immediately | waited for DOMContentLoaded, digest lost | server writes an inert `<template data-rcr id="E:B:n" data-dgst=...>`; the hydration observer (parent and body) flips the boundary to `$!`, takes the error details from that element and retries. 309-313 ms vs 309-313 ms with a slow sibling (was 1518 ms) |
| View transitions (`$RV` in `startViewTransition`, `ViewTransition` components) | supported | none | **not possible without a script**; patches apply outside any transition |
| Single-task reveal / rAF coalescing | yes | no | approximated by one write per window, not guaranteed |

No client coordinator was added. What it could add (single-task atomic reveal, client-measured throttle, view transitions) needs code that runs before the parser applies a patch, i.e. a script, which is what this mode removes. A MutationObserver can only react after patches are already applied.

### Numbers (heavy page: 300 boundaries, prod build, localhost, 10 runs per variant)

`declarative-pages.js` records reveal cadence (separate DOM updates that removed fallbacks, and distinct animation frames); `declarative-bench.js heavy|list|error` adds CDP layout/style-recalc counts, FCP/LCP and bytes (`PLAYWRIGHT_CORE`, `CHROME_PATH` select the library and browser).

| | script path | declarative, batch 0 (previous behavior) | declarative, batch 300 (now) |
| --- | ---: | ---: | ---: |
| HTML bytes without probe | 94,277 | 82,518 | 82,518 (-12.5%) |
| gzip / brotli | 9,492 / 4,207 | 7,057 / 3,006 | 7,057 / 3,006 (-26% / -29%) |
| FCP (median ms) | 60 | 52 | 56 |
| LCP (median ms) | 364 | 80 | 356 |
| first / last reveal (ms) | 344 / 646 | 66 / 536 | 344 / 644 |
| reveal updates / frames | 2 / 2 | 25 / 20 | 3 / 3 |
| layouts | 3 | 21 | 4 |
| style recalcs | 25 | 22 | 5 |
| layout time (ms) | 16 | 17 | 14 |
| main-thread task (ms) | 126 | 139 | 120 |

With 4x CPU throttle (8 runs, noisier): script 2 updates / 3 layouts / LCP 428 ms; batch 0: 17 / 16 / 256; batch 300: 7 / 8 / 364. An earlier run of the same comparison gave 4 updates / 5 layouts at 1x, so expect 3-5 layouts for the declarative path against 3 for the script path.

What this shows: with the server window the declarative path has the script path's reveal cadence (first reveal, last reveal and LCP within noise) and keeps the byte savings, with a few more DOM updates and layouts than the script path (3-5 vs 3) instead of 21. The earlier "LCP gain" was the missing throttle and is gone; `unstable_declarativeBatchMs: 0` remains for anyone who prefers earliest reveal over the script path's pacing (that is the 66 ms / 25 updates column).

SuspenseList (6 items, staggered 100-700 ms), script vs declarative: `forwards` all items in one frame at 722 vs 713 ms; `together` 724 vs 708 ms. `backwards` hydrates with React error 418 in the script path too, so it is not caused by this work. Errored boundary next to a 1.5 s boundary, 4 runs each: client rendered at 309-313 ms for both (the first, cold run of the script read 457 ms for the declarative path, then it settled; before the fix it was 1518 ms).

## What is NOT solved

- **The double-data problem for client components is mostly still there.** Variant (a) still ships 2.09 MB of HTML, of which 1.24 MB is Flight, to render a table whose HTML is 141 KB. Dedupe trims repeated strings and paths (-25% raw Flight, only -9% gzip); the rest is the `product` props passed to client components (85% of those bytes are fields `TableRow` never reads). Fixing that needs either passing fewer props or a protocol change (not re-sending data the SSR response already consumed), which this work does not attempt. Elision cannot touch it: the rows are client references, not static host elements.
- **Elision only covers fully static host subtrees** (host elements, text, primitive props). Anything with a client reference, Suspense, lazy, Promise, form/input/media tags, `ref` or non-primitive props is serialized as before. Real apps with interactive islands inside content get far less than the 76% above.
- **Elision needs framework cooperation and a side channel.** A framework that inlines the wrong stream, or runs SSR and RSC in different processes without shipping the elided rows, breaks (the client falls back to adopting server DOM, which only works when the HTML exists). Not tried in any real framework.
- **SSR CPU is not removed.** (e) is still about 4x slower than plain Fizz (83 vs 341 req/s) because the RSC render, row serialization and SSR Flight parse still happen.
- **Browser-side costs are not measured for elision/dedupe.** Hydration time, memory and main-thread parse cost were not measured, only bytes and jest hydration correctness.
- **Dedupe deliberately reverses an existing React decision**: `ReactFlightDOMEdge-test` has "should not dedupe strings in the model" (don't key a map on arbitrary model strings). Dedupe bounds the map (256 KB of strings), but this needs maintainer sign-off. It also changes cyclic-reference output (no `Lazy` wrapper in one Edge test; that expectation was edited). `resolvingObjects` is a module-level `Set`, which is only safe because serialization is synchronous; it should be per-request. DEV debug-info/async-debug paths were not tested with dedupe on.
- **Flags default to `__EXPERIMENTAL__`**, so elision, dedupe and declarative patching are on in every experimental build. That is wrong for anything but a prototype; they should default to false before any upstreaming.
- **Declarative patching (Chrome 156 only):**
  - Firefox and Safari untested; browsers without `<template for>` leave fallbacks forever, so the UA/feature gate is mandatory and not implemented here.
  - Coordination is approximate (see the table): the throttle runs on the server clock, the first-frame window is an estimate, a group is one write and not one atomic task (4-5 layouts vs 3), and view transitions are impossible without a script.
  - The throttle can hold a completed boundary for up to 300 ms, and the stream stays open that long after the last completion. `unstable_declarativeBatchMs: 0` turns the hold off.
  - `together` lists no longer pre-send hidden content, so the bytes arrive at reveal time.
  - A stylesheet-gated boundary stalls the parser, so every later patch queues behind that stylesheet (head-of-line blocking; the script path doesn't have this). Moving gated patches last in a batch was considered and not done.
  - `<template>` content is parsed as HTML, so boundaries inside SVG/MathML/table-only contexts fall back to scripts.
  - Per-boundary MutationObservers (parent and body) are O(boundaries) per mutation; fine here, not tuned for thousands of pending boundaries.
  - Measured on localhost with one machine; no real network. The server throttle clock ignores network latency.
- **Lazy client split:** only the webpack browser entry; typed-array deferral is a net size loss; the size effect of the reply split on the integrated build was not measured. Turbopack/Parcel/ESM entry points got the elision option plumbing but no tests beyond Flow/lint.
- **Not run:** `ReactFlightDOMNode` and `ReactFlightAsyncDebugInfo` (known failures), `yarn extract-errors`, anything cross-browser, any real framework.
- **Benchmark noise:** req/s on this laptop varies by up to about +/-30% between runs; only the byte numbers are exact.

## Fallback port (status)

`unstable_declarativePatching: true` now means "works in every browser": boundaries get a `<!--B:n-->` anchor, and each group of `<template for>` patches is followed by one small `$RP("B:n",...)` script (the first carries the `$RP` definition from `ReactDOMFizzInlinePatchBoundary.js`, generated into `ReactDOMFizzInstructionSetInlineCodeStrings.js`). Where the browser lacks `<template for>`, `$RP` swaps the fallback range for the template content (skipping ranges React already owns) and re-parses nodes in SVG/MathML. `'native-only'` keeps the old script-free output and SVG/table script-path fallback; the external runtime stays native-only. Nonce is applied to the `$RP` scripts.

- Verified: `ReactDOMFizz(Server|Static|Declarative|ShellHydration|SuppressHydration)` under experimental and www-modern (variant true/false), `yarn lint`, `yarn flow dom-node|dom-browser|custom`. Only failures are the deep-stack tests (`can recover from very deep trees...`, `recovers from a large component stack`), which also fail on the base commit.
- Not verified: `$RP` in a real browser without native support (only server output is unit-tested); the bench `polyfill=1` mode was not re-run.
