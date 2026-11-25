# [Flight] Don't re-ship static server output on initial load (`enableFlightHTMLFirst`)

On first load, an RSC page sends its static markup twice: as HTML for the browser to paint, and again inside the Flight payload the browser inlines to hydrate. For markup that a Server Component renders and that never changes on the client (plain elements, inline CSS, JSON-LD), the second copy is wasted bandwidth. It also costs the server time to serialize, tee and parse.

With `enableFlightHTMLFirst` on, Flight leaves that markup out of the payload the browser receives and writes a small `$J` stub in its place. SSR still needs the real content to write the HTML, so Flight hands it to SSR through the Flight tee ([react/react#38313](https://github.com/react/react/pull/38313)), which lets the in-process SSR client read the render without parsing its bytes. The browser hydrates a stub by adopting the DOM that is already on the page.

This branch builds on the tee. The earlier version ([#24](https://github.com/MaxwellCohen/react/pull/24)) passed the content through a process-global registry instead; see [Compared with the registry version](#compared-with-the-registry-version).

The flag is off by default and is the only one. Payload dedupe is left to the separate upstream work.

## What gets stubbed

Static host output in host position:

- children of host elements
- children of Suspense boundaries
- the entries of a root element map such as `{page, layout}`, which is how Waku shapes its payload

A region is stubbed only if everything in it is static: primitive props, no `ref`, no client references, no Suspense and no pending promises. Tags that need client identity (`form`, `input`, `img`, `svg`, `title`, `link`, `meta`, and similar) are never stubbed. A `<style>` without `precedence` and `href`, and JSON or `application/ld+json` `<script>` blocks, can be. Large strings inside a stubbed region stay in that region and never reach the main stream.

Children of `<template>` are never stubbed. An element under about 48 bytes stays in the payload, set by the constant `MIN_STUB_WEIGHT`. A stub for `<span>label</span>` saves about 25 bytes and costs the browser a component. The constant estimates payload bytes, not hydration cost (see [Hydration time](#hydration-time)).

Client Components are never stubbed and keep all their props. Props other than `children` (`panels`, `fallback`) stay in the payload, because the client may render them later without any server DOM behind them. An element that a Client Component receives in `children` is never a stub, so `Children.only`, `cloneElement` and a check on `child.type` see what they see with the option off. What is inside that element can still be a stub.

## How a framework uses it

The framework reads the Flight render that feeds HTML SSR through a tee and passes `htmlFirst`, a promise that settles when that HTML render is done, on it:

```js
const tee = createTee(serverConsumerManifest);       // client, before the render
let done;
const htmlFirst = new Promise((resolve, reject) => (done = {resolve, reject}));
const stream = renderToReadableStream(model, manifest, {htmlFirst, tee});
// inside the Fizz render:
const root = createFromTee(tee);                     // instead of createFromReadableStream
// `stream` is still inlined into the HTML for the browser
// Fizz onAllReady: done.resolve();   Fizz onError or abort: done.reject(error);
```

From there:

1. While Flight walks the render, it writes a `$J` stub to the bytes and hands a copy of the real element to the tee's reader at the same node. One walk classifies the subtree, checks taint and builds the copy from a single read of each property. SSR therefore shares no object with the server, and a getter is read once, so the HTML and a late row cannot disagree. Fizz sees the full content and writes complete HTML.
2. The bytes carry the stubs and a `:P<id>` row that names the payload, so every decode of it in the browser shares the node that hydration adopted.
3. Content the reader never rendered (the children of a closed modal) is written to the bytes as late rows once `htmlFirst` has fulfilled. If it rejects (Fizz reported an error or was aborted), React writes a row for every stub, so no refetch is needed. The Flight stream stays open until `htmlFirst` settles. There are no timers.
4. The browser sees the stubs and adopts the HTML. A stub is one hook. The renderer recognizes a stub by its `$$typeof` and passes it whether it is hydrating, which adds 10 lines to `ReactFiberBeginWork.js`.

`htmlFirst` without a tee stubs nothing (unless `onValue` is given), and `htmlFirst: true`, the old form, does nothing. The webpack and Turbopack server entries take the option. The Parcel, ESM and unbundled entries take neither the option nor a tee. On a runtime without `AsyncLocalStorage`, the Edge client runs hints directly, as reading bytes does.

Without the option nothing is stubbed. Navigation, refetch and action responses therefore need no change, and forgetting the option loses the savings but breaks nothing. React cannot tell where a stream is going, because the bytes are identical either way, so the framework has to say. It already knows which requests are which: Waku serves RSC requests under an `RSC/` URL prefix, and Next.js sends an `RSC: 1` header.

For a consumer with no reader, pass `htmlFirst: {onValue(id, element)}`, which receives the live element of each stub. Next.js uses it to re-encode a stored payload for a prerendered page. The JSON side channel (`onRow` on the server, `htmlFirstRows` on the client) is gone. The same taint checks apply as on the normal path.

If a stub has neither server DOM nor a late row, React cannot recreate the content. That happens when React client-renders a boundary for a reason the server never saw (see [Limits](#limits)). Pass `onMissingHTML` to `createFromReadableStream` or `createFromFetch` and refetch a full payload there. Without it the stub suspends and reports an uncaught error that names the element.

On a client navigation the response is an ordinary full payload with real elements where the stubs were. If a stub's DOM already renders the new element, React keeps the stub and its DOM. If the content changed, React replaces the DOM. Patching it in place is in a follow-up ([MaxwellCohen/react#31](https://github.com/MaxwellCohen/react/pull/31)), because that update happens outside the reconciler. See [Keeping stubs on later full payloads](#keeping-stubs-on-later-full-payloads). Client Components keep their state.

## Compared with the registry version

| | Registry ([#24](https://github.com/MaxwellCohen/react/pull/24)) | Tee (this branch) |
|---|---|---|
| How SSR gets the stubbed elements | a map on `globalThis`, claimed by the first in-process `createFrom*` that reads a `:P` id | the tee's reader, which the framework creates for that render |
| How SSR reads the rest of the payload | parses the bytes | gets values from the tee, no parse, as copies of the stubbed elements |
| When late rows start | a `:q` row plus timers that guess when SSR is done | when the `htmlFirst` thenable fulfils (no timers) |
| Lifetime of unclaimed rows | FinalizationRegistry, or a fallback release | none: nothing global holds them |
| Fizz changes | `currentRequest` kept pinned so late hints reach Fizz | none; the tee runs hints in the reader's context |
| Framework change | pass `htmlFirst: true` | create a tee, pass `{htmlFirst: <thenable>, tee}`, settle it when Fizz is done, read with `createFromTee` |
| Channels | the flag alone | the flag; this branch does not change `enableFlightTee`, and builds that try it on canary force both flags |

The tee also needed one scheduling change: a pass runs the tasks it pinged before it yields, so the reader doesn't render up to a row that was split for size and suspend on each piece.

## Results

These are for the build of November 23, 2026. The framework runs used the files in release [`html-first-flight-tee-d5dd0f5`](https://github.com/MaxwellCohen/react-eco-ci/releases/tag/html-first-flight-tee-d5dd0f5), which has React at `d5dd0f511d` on the canary channel with both flags forced on. "Previous" is the build of November 19, 2026 (React `189973d24a` for the frameworks). Numbers from the registry version are dated November 19, 2026 and are in [results-tee/README.md](https://github.com/MaxwellCohen/react/tree/rsc/html-first-results/fixtures/flight-ssr-bench/results-tee/). The corpus commands and tables for this build are in [results-tee/final-2026-11-23/README.md](https://github.com/MaxwellCohen/react/tree/rsc/html-first-results/fixtures/flight-ssr-bench/results-tee/final-2026-11-23/).

### Corpus

The corpus now has 45 pages. Byte totals below are for the original 41 pages at `--size full`, off against on, measured at `d1d54751a9`. Gzip and brotli are of the whole document, and Flight is the inlined `<script>` payload.

| Metric | Off | On | Change | Previous change |
|---|---:|---:|---:|---:|
| Gzip | 1,023,745 | 594,628 | −41.9% | −42.8% |
| Raw HTML | 14,560,723 | 7,675,454 | −47.3% | −50.2% |
| Inlined Flight | 9,282,481 | 2,397,212 | −74.2% | −78.7% |
| Brotli | 478,282 | 293,860 | −38.6% | −40.5% |

Over all 45 pages gzip falls from 1,089,665 to 651,644 bytes (−40.2%), and the page stubs number 19,366 against 18,266 for the 41 pages. The savings are uneven. Five pages make up 82.0% of the gzip bytes saved over the 41 pages (80.3% over the 45), and the median page saves 6.2% (3.6% over the 45). Five pages get larger in gzip. `repeated-long-strings` grows by 1,461 bytes, and `server-error-in-suspense` (+17), `head-hoistables` (+5), `suspense-fallback-shown-late` (+3) and `deep-tree` (+2) grow by a few bytes. The stub size limit costs 0.2% more gzip over the 45 pages (19,366 stubs instead of 30,979). See `yarn scenarios:metrics`.

### Hydration time

Chromium at 4× CPU throttle, 15 interleaved loads, median milliseconds from `hydrateRoot` until two tasks after the passive effects. The last column is the build before the stub and size-limit changes. No page is more than 10% slower than off, where two were 69% and 88% slower before.

| Page | Stubs | Off | On | Before the limit |
|---|---:|---:|---:|---:|
| `data-grid-server-cells` | 1 | 97.9 | 22.0 | 24 |
| `server-table-client-rows` | 990 | 61.6 | 39.7 | 55 |
| `tiny-stubs-many` | 0 | 71.4 | 70.5 | 120 |
| `product-listing` | 2,872 | 77.6 | 80.7 | 145 |
| `islands-many-tiny` | 502 | 36.9 | 40.3 | 52 |
| `client-aschild-slot` | 300 | 34.2 | 36.9 | 50 |
| `realistic-storefront` | 7 | 36.8 | 37.2 | 54 |
| `cart-quantity-steppers` | 103 | 30.6 | 30.8 | 40 |
| `data-grid-client-cells` | 1 | 59.6 | 60.5 | 64 |

### Next.js 16.4.6

Patch: `MaxwellCohen/next.js` branch `html-first/16.4-tee-signal` (commit `aee2533f7c`), a two-file change of about 75 lines on top of `html-first/16.4-tee`. Dynamic HTML renders, PPR resumes and the staged render behind cached navigations create a tee and pass `{htmlFirst: <thenable>, tee}`, and SSR reads with `createFromTee`. A PPR resume whose HTML is already complete gets no tee and keeps a full payload. Prerendered pages inline their payload decoded and re-encoded with stubbing through `onValue` (no Server Component runs twice), while the stored `.rsc` stays complete. Hydration and the client cache's decode pass `onMissingHTML`, which refetches the current route and keeps the client caches.

The method was `next start` with Turbopack, autocannon with 16 connections for 10 seconds after a 10-second warm-up, and 5 interleaved rounds, run twice. The load average was 3.3 to 4.9. Throughput is the multiple of off, with the range in parentheses.

| 1000-row table | Off | On | Previous |
|---|---|---|---|
| requests/s, dynamic, run A | 66.4 | 2.98× (2.81–3.00) | 3.50× |
| requests/s, dynamic, run B | 63.8 | 3.05× (2.80–3.35) | 3.21× |
| TTFB, dynamic | 16.2 ms | 0.37× | 0.33× |
| requests/s, Client Component rows | 142.4 | 1.19× | 1.26× |
| inlined Flight, dynamic | 765,387 B | 24,844 B | 23,363 B |
| gzip HTML, dynamic | 108,928 B | 55,274 B | 55,217 B |
| inlined Flight, Cache Components PPR / static | 125,424 / 125,258 B | 4,302 / 11,725 B | 4,268 / 11,609 B |
| main thread on `router.refresh()` (first, second) | 17.5 ms, 12 ms | 19 ms, 10 ms | 19 ms, 10 ms |
| DOM nodes after leaving the page | 256 | 75 | 75 |

- **Against the previous build.** This build is 0.85× (run A) and 0.95× (run B) of the previous build on the table page and 0.97× on Client Component rows. The copies that SSR now gets are the cause. With one line changed to hand SSR the server's own elements, the table page is 0.97× of the previous build, and GC time per request falls from 0.64 ms to 0.34 ms. Waku and the in-process run do not show the cost.
- **Browser.** The DOM matches stock on every page checked, with no console messages.
- **End-to-end tests.** With the option on, 871 tests pass, 0 fail and 251 are skipped, across Next's 52 suites in production mode with Turbopack. With it off, 172 pass and 4 are skipped, in `rsc-basic`, `app-action` and `navigation`.
- **Bailing out of SSR.** A Client Component that throws on the server, inside a boundary with static siblings, shows them after hydration with no second request.
- **Not tested.** Next.js with webpack.

Next needed these on top of the first version of this PR: Fragment children stay in host position; plain data (objects, arrays, Maps) keeps the position it is in; void elements are never stubbed on their own; `renderToReadableStream` in the Turbopack build forwards the option; late rows; adopted nodes shared between decodes of one payload; the server's inline `display` kept across Activity; detached stubs kept as a snapshot; and keeping stubs on later full payloads (below).

### Waku 1.0.0-rc.4

Waku was used because it is easy to patch and has good RSC support. Nothing here depends on it. The patch is the `rsc-html-first-tee-signal` branch of `MaxwellCohen/wakujs` (commit `44d7a8fe`, 4 files). The HTML render creates a tee, passes `{htmlFirst: <thenable>, tee}` and reads SSR with `createFromTee`, and `Root` passes `onMissingHTML` for the initial payload. The test page has 1000 rows. Each cell shows run 1 and run 2, each of 5 rounds with the variant order rotated.

| Page | Off | On, requests/s × off | Previous, requests/s × off |
|---|---:|---:|---:|
| `table-host` | 53.6, 55.0 req/s | 4.07, 3.62 | 3.93, 3.59 |
| `table-client` | 102.7, 98.8 req/s | 1.58, 1.49 | 1.52, 1.49 |

- **Bytes.** Inlined Flight on `table-host` is 19,066 B against 823,655 B for off.
- **Browser.** Hydration, counters and client navigation to all 1000 rows pass. The SSR-error page shows its static sections with no RSC request.
- **Unit tests.** 1,351 pass.

### In-process SSR timing

Median milliseconds per render over 60 interleaved runs of `bench-tee.js`, with 1000 rows and `NODE_ENV=production`.

| Variant | Server rows | Client rows |
|---|---:|---:|
| Baseline | 41.1 | 16.4 |
| Tee only | 34.5 | 15.0 |
| HTML-first + tee | 16.3 | 14.8 |

The copies SSR receives cost little. A build that hands SSR the server's own elements runs server rows at 0.978× the time. Build-to-build noise in the same run is 2.6%, so the difference is within noise. I did not measure the copies on pages other than these two.

### Keeping stubs on later full payloads

A refresh, a server action that revalidates, or returning to a PPR page brings real elements where the stubs are. React sees a type change (the stub is a function component) and rebuilds that DOM. `ReactChildFiber` now asks the host config, at the two places a type mismatch replaces a child, whether the stub's DOM already renders the new element (`instanceMatchesStaticElement`). If so the stub fiber is reused. If the content differs, React replaces the DOM, and patching it in place is in [MaxwellCohen/react#31](https://github.com/MaxwellCohen/react/pull/31). The check is behind `enableFlightHTMLFirst && supportsHydration`, only runs on fibers whose type carries `REACT_STATIC_STUB_TYPE`, and suspends on lazy content that hasn't loaded, like rendering the element would. Alternatives that were tested and rejected:

- No reconciler involvement: the rebuild above.
- The stub as a host element of the same tag, so the real element is an ordinary update: React replaces the server's children on that update.
- The stub as a dehydrated Suspense boundary: the boundary keeps the server DOM until the real element arrives, then it is client rendered and the original nodes are replaced.

A stub that unmounts keeps its node's attributes and HTML as strings, so a later mount (Back) can rebuild it without a request. Keeping the node instead held detached nodes, and keeping nothing made Back refetch the route. In the Next.js table page the JS heap after leaving it is 4.08 MB with the snapshot against 4.35 MB for stock.

## Correctness

A modal whose static children mount only after a click gets them as late rows and shows its content. On Next.js the `/modal` page shows 20 clauses on all three variants with no console messages.

The corpus (`SCENARIO_BUILDS=$B yarn scenarios:check --size smoke`, then again with `--browser firefox`) loads each page with and without the flag and compares the hydrated DOM, the DOM after interaction and the DOM after a client navigation to a full payload. All 45 pages pass in Chromium 139 and Firefox 159. WebKit was not run, because the cached WebKit does not work with this Playwright. The comparison normalizes style spacing, zero-length CSS units (`0px` against `0`) and attribute order. The `head-hoistables` page is compared against a tee without stubs, because a tee always delivers preload hints to Fizz and reading bytes drops them on a small page.

Other checks:

- `yarn e2e`: hydration adopts the same DOM nodes (1000 of 1000 rows, `<style>`, JSON-LD) with no warnings, and the counters work. I did not rerun it for the build of November 23, 2026.
- React tests: 136 tests in 6 suites (the HTML-first, tee and Ledgers suites) pass on experimental, stable and experimental production builds. 85 of them are in the four HTML-first suites.
- Adversarial tests: [`rsc/html-first-adversarial-tests`](https://github.com/MaxwellCohen/react/compare/rsc/html-first-on-tee...rsc/html-first-adversarial-tests) adds 23 tests that each assert the page behaves as it does with the option off. 19 pass, and the 4 that fail are the first and third gaps under Limits.
- `node e2e/bindings-smoke.js` runs every bundler binding (webpack, turbopack, parcel, unbundled, esm). I did not rerun it for this build.
- ESLint and Prettier pass on every changed file.

## Limits

- A rejection is all or nothing. One Fizz error makes React write every stubbed row of the page, so the page is about as large as with the option off but needs no second request. A framework can fulfil instead and let the affected stubs refetch.
- A boundary that React client-renders for a reason the server never saw still refetches through `onMissingHTML`. Examples are an update that reaches a boundary before it hydrates, and children removed before their boundary hydrates. With the option off these render from the payload.
- Invalid nesting is adopted as the browser parsed it. `<p><div>` or a `<table>` without `<tbody>` hydrates with no error. With the option off React reports a hydration error and rebuilds the DOM.
- `MIN_STUB_WEIGHT` estimates payload bytes, not hydration cost.
- The hoisted `<head>` content of a page can differ from stock in which preload links appear. Resources that matter are the same.
- Four Flight tests fail on experimental builds, and the same four fail on upstream alone. Three are Node Buffer pool tests, and the fourth is `ReactFlightAsyncDebugInfo` "can track async file reads".
- Through the tee, SSR sees a weak promise's placeholder value instead of staying pending. Nothing reads one during SSR in Waku or Next.js today.
- The scheduling change above has no unit test.
- Stubbing Client Components themselves is out of scope. It needs a guarantee that the component does nothing in the browser.
