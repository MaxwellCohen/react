# [Flight] Don't re-ship static server output on initial load (`enableFlightStaticHostElision`)

On first load, an RSC page sends its static markup twice: as HTML for the browser to paint, and again inside the Flight payload the browser inlines to hydrate. For markup that a Server Component renders and that never changes on the client (plain elements, inline CSS, JSON-LD), the second copy is wasted bandwidth. It also costs the server time to serialize, tee and parse.

With `enableFlightStaticHostElision` on, Flight leaves that markup out of the payload the browser receives and writes a small `$J` stub in its place. SSR still needs the real content to write the HTML, so Flight hands it over separately. The browser hydrates a stub by adopting the DOM that is already on the page.

The flag is off by default and is the only one. Payload dedupe is left to the separate upstream work.

## What gets elided

Static host output in host position:

- children of host elements
- children of Suspense boundaries
- `children` of Client Components (layouts, slots)
- the entries of a root element map such as `{page, layout}`, which is how Waku shapes its payload

A region is elided only if everything in it is static: primitive props, no `ref`, no client references, no Suspense and no pending promises. Tags that need client identity (`form`, `input`, `img`, `svg`, `title`, `link`, `meta`, and similar) are never elided. A `<style>` without `precedence` and `href`, and JSON or `application/ld+json` `<script>` blocks, can be. Large strings inside an elided region stay in that region and never reach the main stream.

Client Components are never elided and keep all their props. Props other than `children` (`panels`, `fallback`) stay in the payload, because the client may render them later without any server DOM behind them.

## How a framework uses it

The framework passes `elideStaticHosts: true` on the Flight render that feeds HTML SSR. Nothing else is needed. From there:

1. Flight stores the elided rows in a registry on `globalThis` and writes a `:Q<id>` row into the stream.
2. The first in-process `createFrom*` on that stream claims the rows, so Fizz sees the full content and writes complete HTML. Rows that are never claimed (nothing in-process reads the stream) are released when the Flight request is garbage collected, which only happens once no consumer can still read the stream.
3. The browser has an empty registry. It sees the stubs and adopts the HTML.

Without the option nothing is elided. Navigation, refetch and action responses therefore need no change, and forgetting the option loses the savings but breaks nothing. React cannot tell where a stream is going, because the bytes are identical either way, so the framework has to say. It already knows which requests are which: Waku serves RSC requests under an `RSC/` URL prefix, and Next.js sends an `RSC: 1` header.

For out-of-process or custom consumers, pass `elideStaticHosts: {onRow, onValue}` instead. `onRow(id, json)` receives the row as JSON and `onValue(id, value)` receives the live element. The SSR-side client then takes the rows as the `elidedHostRows` option. The same taint checks apply as on the normal path.

If a stub ends up client-rendered with no server DOM behind it (a modal or `ClientOnly` wrapper mounted after hydration, or a boundary that client-renders after a server error), React cannot recreate the content. Pass `onElidedContentMissing` to `createFromReadableStream` or `createFromFetch` and refetch a full payload there. Without it the stub suspends and reports an uncaught error.

On a client navigation the response is an ordinary full payload with real elements where the stubs were. React unmounts the stubs and creates fresh DOM for those regions. It does not try to reuse the old DOM, because the new page's content can differ from it. Client components keep their state.

## Results

### 41-scenario corpus

Flag off against flag on at full size, summed over the 41 pages. Measured at `31b26561f1`. Gzip and brotli are of the whole document, and Flight is the inlined `<script>` payload.

| Metric | Flag off | Flag on | Change |
|---|---:|---:|---:|
| Gzip | 1,023,906 | 586,852 | −42.7% |
| Raw HTML | 14,555,714 | 7,252,862 | −50.2% |
| Inlined Flight | 9,280,754 | 1,977,902 | −78.7% |
| Brotli | 479,414 | 286,520 | −40.2% |

A few heavy pages account for most of this. The five biggest (`data-grid-server-cells`, `wide-tree`, `huge-inline-svg`, `marketing-style-jsonld`, `docs-sidebar-toc`) make up about 80% of the gzip bytes saved. The median page saves 7.8%, nine pages are within ±1%, and seven pages get slightly larger: `repeated-long-strings` (+12.4%), `tabs-panels-prop`, `nested-suspense-waterfall`, `all-client`, `suspense-fallback-shown-late`, `full-refresh-focus` and `server-element-via-props` (each under +2%). `all-client` has nothing to elide and pays for the `:Q` row. See [SCENARIOS.md](./SCENARIOS.md) and `yarn scenarios:metrics`.

### Waku

Waku was used because it is easy to patch and has good RSC support; nothing here depends on it. The test page has 1000 rows. The numbers are medians over 5 rounds, with the order of the variants rotated each round.

| | Stock | Flag on, stock Waku | Flag on, Waku passes `elideStaticHosts: true` |
|---|---:|---:|---:|
| requests/s | 1.00 | 1.00 | 3.21× (3.10–3.24) |
| TTFB | 1.00 | 0.98 | 0.43× |
| inlined Flight | 823,655 B | 823,655 B | 18,978 B |
| gzip HTML | 130,459 B | 130,460 B | 60,890 B |

With the flag on and no opt-in, Waku's output is byte-identical to stock. A second page whose rows are Client Components gets 1.10×. On every variant the page hydrates, the counters work, there are no console errors, and a client navigation fetches the full payload (602,063 B) and renders all 1000 rows. The patch is the `rsc-html-first-optin` branch of `MaxwellCohen/wakujs`: the HTML render passes `elideStaticHosts: true` and nothing else changes.

## Correctness

The corpus (`yarn scenarios:check --size full --variants off,all --browser chromium`) loads each page with and without the flag and checks that:

- the hydrated DOM and the DOM after interaction are equal,
- there are no console or hydration errors,
- the page still works after a client navigation to a full payload.

All 41 pass in Chromium at `31b26561f1`. The DOM comparison normalizes style spacing, zero-length CSS units (`0px` against `0`) and attribute order. Firefox and WebKit passed on earlier commits and have not been run on this one.

Other checks:

- `yarn e2e`: hydration adopts the same DOM nodes (1000 of 1000 rows, `<style>`, JSON-LD) with no warnings, and the counters work.
- Jest: `ReactFlightDOMBrowserStaticHostElision-test` and `ReactFlightDOMBrowserHostElision-test` cover leakage, hydration inside Suspense, keyed children, taint on live rows, navigation to different content, root element maps, and the flag with no option leaving the stream alone.
- `node e2e/bindings-smoke.js` runs every bundler binding (webpack, turbopack, parcel, unbundled, esm).

## Limits

- The hoisted `<head>` content of a page can differ from stock in which preload links appear. Resources that matter are the same.
- Next.js has not been tried. The opt-in there would be `elideStaticHosts: true` when the request is not an RSC request.
- Four Jest tests fail in this environment on the base commit as well (three Node Buffer-pool checks under Node 26 and one Edge outlining timeout).
- Eliding Client Components themselves is out of scope. It needs a guarantee that the component does nothing in the browser.
