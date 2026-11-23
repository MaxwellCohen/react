# [Flight] Don't re-ship static server output on initial load (`enableFlightHTMLFirst`)

On first load, an RSC page sends its static markup twice: as HTML for the browser to paint, and again inside the Flight payload the browser inlines to hydrate. For markup that a Server Component renders and that never changes on the client (plain elements, inline CSS, JSON-LD), the second copy is wasted bandwidth. It also costs the server time to serialize, tee and parse.

With `enableFlightHTMLFirst` on, Flight leaves that markup out of the payload the browser receives and writes a small `$J` stub in its place. SSR still needs the real content to write the HTML, so Flight hands it to SSR through the Flight tee ([react/react#38313](https://github.com/react/react/pull/38313)), which lets the in-process SSR client read the render without parsing its bytes. The browser hydrates a stub by adopting the DOM that is already on the page.

This branch builds on the tee. The earlier version ([#24](https://github.com/MaxwellCohen/react/pull/24)) passed the content through a process-global registry instead; see [Compared with the registry version](#compared-with-the-registry-version).

The flag is off by default and is the only one. Payload dedupe is left to the separate upstream work.

## What gets stubbed

Static host output in host position:

- children of host elements
- children of Suspense boundaries
- `children` of Client Components (layouts, slots)
- the entries of a root element map such as `{page, layout}`, which is how Waku shapes its payload

A region is stubbed only if everything in it is static: primitive props, no `ref`, no client references, no Suspense and no pending promises. Tags that need client identity (`form`, `input`, `img`, `svg`, `title`, `link`, `meta`, and similar) are never stubbed. A `<style>` without `precedence` and `href`, and JSON or `application/ld+json` `<script>` blocks, can be. Large strings inside an stubbed region stay in that region and never reach the main stream.

Client Components are never stubbed and keep all their props. Props other than `children` (`panels`, `fallback`) stay in the payload, because the client may render them later without any server DOM behind them.

## How a framework uses it

The framework reads the Flight render that feeds HTML SSR through a tee and passes `htmlFirst: true` on it:

```js
const tee = createTee(serverConsumerManifest);       // client, before the render
const stream = renderToReadableStream(model, manifest, {htmlFirst: true, tee});
// inside the Fizz render:
const root = createFromTee(tee);                     // instead of createFromReadableStream
// `stream` is still inlined into the HTML for the browser
```

From there:

1. While Flight walks the render, it writes a `$J` stub to the bytes and hands the real element to the tee's reader at the same node (tee method `h`). Fizz sees the full content and writes complete HTML.
2. The bytes carry the stubs and a random `:P<id>` row that names the payload, so every decode of it in the browser shares the node that hydration adopted.
3. Content the reader never rendered (the children of a closed modal) is written to the bytes as late rows once the tee has closed and the reader has rendered what it is going to render. A reader that never renders keeps the stream open for at most one second.
4. The browser sees the stubs and adopts the HTML.

`htmlFirst: true` without a tee stubs nothing, and the bytes are identical to omitting it. The tee is in every server entry (Node, Edge and Browser) and the Node and Edge clients. On a runtime without `AsyncLocalStorage`, the Edge client runs hints directly, as reading bytes does.

Without the option nothing is stubbed. Navigation, refetch and action responses therefore need no change, and forgetting the option loses the savings but breaks nothing. React cannot tell where a stream is going, because the bytes are identical either way, so the framework has to say. It already knows which requests are which: Waku serves RSC requests under an `RSC/` URL prefix, and Next.js sends an `RSC: 1` header.

For out-of-process or custom consumers, pass `htmlFirst: {onRow, onValue}` instead, with or without a tee. `onRow(id, json)` receives the row as JSON and `onValue(id, value)` receives the live element. The SSR-side client then takes the rows as the `htmlFirstRows` option. The same taint checks apply as on the normal path.

If a stub ends up client-rendered with no server DOM behind it (a modal or `ClientOnly` wrapper mounted after hydration, or a boundary that client-renders after a server error), React cannot recreate the content. Pass `onMissingHTML` to `createFromReadableStream` or `createFromFetch` and refetch a full payload there. Without it the stub suspends and reports an uncaught error that names the element.

On a client navigation the response is an ordinary full payload with real elements where the stubs were. If a stub's DOM already renders the new element, React keeps the stub and its DOM; if the content changed, React patches the DOM in place (see [Keeping stubs on later full payloads](#keeping-stubs-on-later-full-payloads)). Client components keep their state.

## Compared with the registry version

| | Registry ([#24](https://github.com/MaxwellCohen/react/pull/24)) | Tee (this branch) |
|---|---|---|
| How SSR gets the stubbed elements | a map on `globalThis`, claimed by the first in-process `createFrom*` that reads a `:P` id | the tee's reader, which the framework creates for that render |
| How SSR reads the rest of the payload | parses the bytes | gets values from the tee, no parse |
| When late rows start | a `:q` row plus timers that guess when SSR is done | when the tee closes |
| Lifetime of unclaimed rows | FinalizationRegistry, or a fallback release | none: nothing global holds them |
| Fizz changes | `currentRequest` kept pinned so late hints reach Fizz | none; the tee runs hints in the reader's context |
| Framework change | pass `htmlFirst: true` | create a tee, pass `{htmlFirst: true, tee}`, read with `createFromTee` |
| Channels | the flag alone | the flag; `enableFlightTee` is on in canary on this branch |

The tee also needed one scheduling change: a pass runs the tasks it pinged before it yields, so the reader doesn't render up to a row that was split for size and suspend on each piece.

## Results

These are for the tee. Registry numbers for the same runs are in [results-tee/README.md](./results-tee/README.md) and the summary page.

### 41-scenario corpus

Off against tee at full size, summed over the 41 pages. Measured at `679a7e8309`. Gzip and brotli are of the whole document, and Flight is the inlined `<script>` payload.

| Metric | Off | Tee | Change |
|---|---:|---:|---:|
| Gzip | 1,021,743 | 584,582 | −42.8% |
| Raw HTML | 14,557,449 | 7,250,515 | −50.2% |
| Inlined Flight | 9,279,289 | 1,972,355 | −78.7% |
| Brotli | 478,421 | 284,500 | −40.5% |

The five biggest savings make up about 80% of the gzip bytes saved. The median page saves 8.8%, nine pages are within ±1%, and two get larger: `repeated-long-strings` (+12.5%) and `nested-suspense-waterfall` (+0.8%). The registry version is 55 B larger on every stubbed page, from its `:q` row. See [results-tee/README.md](./results-tee/README.md) and `yarn scenarios:metrics`.

### Waku

Waku was used because it is easy to patch and has good RSC support; nothing here depends on it. The test page has 1000 rows. The numbers are two runs of 5 rounds each, with the order of the variants rotated each round, all on canary React at `189973d24a`.

| | Stock | Stock Waku, this React | Tee |
|---|---:|---:|---:|
| requests/s, table | 1.00 | 1.04×, 0.98× | 4.14×, 3.39× |
| requests/s, Client Component rows | 1.00 | 1.00×, 0.95× | 1.47×, 1.53× |
| inlined Flight, table | 823,655 B | 823,655 B | 18,991 B |

The registry version measured 3.92× and 3.61× on the table and 1.04× and 1.12× on the Client Component rows in the same runs. On every variant the page hydrates, the counters work, there are no console errors, and a client navigation renders all 1000 rows. The patch is the `rsc-html-first-tee` branch of `MaxwellCohen/wakujs`: the HTML render creates a tee, passes `{htmlFirst: true, tee}` and reads SSR with `createFromTee`, and `Root` passes `onMissingHTML` for the initial payload.

### Next.js 16.4.6

Patch: `MaxwellCohen/next.js` branch `html-first/16.4-tee`. Dynamic HTML renders, PPR resumes and the staged render behind cached navigations create a tee and pass `{htmlFirst: true, tee}`, and SSR reads with `createFromTee`. A PPR resume whose HTML is already complete gets no tee and keeps a full payload; prerendered pages inline their payload decoded and re-encoded with stubbing (no Server Component runs twice), while the stored `.rsc` stays complete; hydration and the client cache's decode pass `onMissingHTML`, which refetches the current route and keeps the client caches.

| 1000-row table | stock | tee |
|---|---|---|
| inlined Flight, dynamic | 765,387 B | 23,364 B |
| requests/s, dynamic | 1.00 | 3.41× (2.55–3.54) |
| requests/s, Client Component rows | 1.00 | 1.29× (1.22–1.70) |
| main thread on `router.refresh()` (first, second) | 16 ms, 13 ms | 19 ms, 11.5 ms |
| DOM nodes after leaving the page | 256 | 75 |

The registry version measured 3.49× and 1.06× in the same rounds. Next's own e2e suites (52, including Cache Components and PPR), with the canary build in Next's stable slots and the experimental build in its experimental slots, pass. Three suites timed out in setup on an overloaded machine and passed 3 of 3 reruns. The numbers are from the exact files in release [`html-first-flight-tee-189973d`](https://github.com/MaxwellCohen/react-eco-ci/releases/tag/html-first-flight-tee-189973d).

Next needed these on top of the first version of this PR: Fragment children stay in host position; plain data (objects, arrays, Maps) keeps the position it is in; void elements are never stubbed on their own; `renderToReadableStream` in the Turbopack and unbundled Node builds forwards the option; late rows; adopted nodes shared between decodes of one payload; the server's inline `display` kept across Activity; detached stubs kept as a snapshot; and keeping stubs on later full payloads (below).

### Keeping stubs on later full payloads

A refresh, a server action that revalidates, or returning to a PPR page brings real elements where the stubs are. React sees a type change (the stub is a function component) and rebuilds that DOM: 1,044 nodes and 46 ms of main thread on the table page, against 18 ms for stock. `ReactChildFiber` now asks the host config, at the two places a type mismatch replaces a child, whether the stub's DOM already renders the new element (`instanceMatchesStaticElement`). If so the stub fiber is reused; if the content differs, the host config patches the DOM in place. The check is behind `enableFlightHTMLFirst && supportsHydration`, only runs on fibers whose type carries `REACT_STATIC_STUB_TYPE`, and suspends on lazy content that hasn't loaded, like rendering the element would. Alternatives that were tested and rejected:

- No reconciler involvement: the rebuild above.
- The stub as a host element of the same tag, so the real element is an ordinary update: React replaces the server's children on that update.
- The stub as a dehydrated Suspense boundary: the boundary keeps the server DOM until the real element arrives, then it is client rendered and the original nodes are replaced.

A stub that unmounts keeps its node's attributes and HTML as strings, so a later mount (Back) can rebuild it without a request. Keeping the node instead held about 14,000 detached nodes for the table page; keeping nothing made Back refetch the route. With the snapshot the page left in Next's cache uses less memory than stock, which keeps the whole element tree.

## Correctness

With the recovery wired, a modal whose static children mount only after a click shows its content, the same as stock. Without the recovery, the same page reports an uncaught error and never shows the content. (`waku-htmlfirst-bench`, page `late-modal`, three variants.)

The corpus (`yarn scenarios:check --size full --variants off,tee --browser chromium`) loads each page with and without the flag and checks that:

- the hydrated DOM and the DOM after interaction are equal,
- there are no console or hydration errors,
- the page still works after a client navigation to a full payload.

All 41 pass in Chromium 139, Firefox 157 and WebKit 18.4 for off, registry and tee. The DOM comparison normalizes style spacing, zero-length CSS units (`0px` against `0`) and attribute order.

Other checks:

- `yarn e2e`: hydration adopts the same DOM nodes (1000 of 1000 rows, `<style>`, JSON-LD) with no warnings, and the counters work.
- Jest: `ReactFlightDOMBrowserHTMLFirstStatic-test` and `ReactFlightDOMBrowserHTMLFirst-test` cover leakage, hydration inside Suspense, keyed children, taint on live rows, navigation to different content, root element maps, and the flag with no option leaving the stream alone.
- `node e2e/bindings-smoke.js` runs every bundler binding (webpack, turbopack, parcel, unbundled, esm).

## Limits

- The hoisted `<head>` content of a page can differ from stock in which preload links appear. Resources that matter are the same.
- A few Jest tests fail in this environment on `flight-value-path` as well (Node 26 Buffer-pool checks, async file-read debug info, the `findDOMNode` import in Node and a large component stack in shell hydration).
- Through the tee, SSR sees a weak promise's placeholder value instead of staying pending. Nothing reads one during SSR in Waku or Next.js today.
- Stubbing Client Components themselves is out of scope. It needs a guarantee that the component does nothing in the browser.
