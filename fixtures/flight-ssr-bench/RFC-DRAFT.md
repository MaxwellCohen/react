# RFC (draft): Cutting the "double data" cost of Server Components + SSR, and streaming without scripts

Status: prototype, behind flags, branch `t3/integrate-flight-fizz-features`. Everything below is measured on one laptop (Node v26.13.0, macOS arm64, Chrome 156.0.8078.80); see `fixtures/flight-ssr-bench/INTEGRATION.md` for commands, raw numbers and the full "not solved" list.

## Problem

A page rendered by Server Components and server-side rendered to HTML sends the same information twice: as HTML, and as the Flight payload that the browser needs to hydrate (inlined as `<script>` chunks). In a 1000-row product table:

| | HTML | of which Flight |
| --- | ---: | ---: |
| (a) server table + client row components, Flight inlined | 2,500,026 B (149,680 gz) | 1,650,803 B (109,089 gz) |
| (c) the same markup, plain Fizz | 140,727 B (14,223 gz) | 0 |

A payload breakdown (`analyze-flight.js`) of (a): 58.5% string values, 32.5% object keys; 88.8% is the `product` prop of the 1000 client rows, and only 15% of those bytes are fields the component reads. Separately, Fizz streams Suspense completions as inline scripts (`$RC`, `<template id>`), which cost bytes, need nonces/CSP handling, and run on the main thread.

## Measurements (median of 3 runs; bytes are exact, req/s is noisy, about +/-30%)

All flags on (see "Flags") vs the same tree with elision and dedupe off, in the same session:

| Variant | HTML bytes (off -> on) | HTML gzip (off -> on) | req/s c=1 (off -> on) |
| --- | --- | --- | --- |
| (a) server component, client rows | 2,500,026 -> 2,090,476 (-16.4%) | 149,680 -> 140,093 (-6.4%) | 23.4 -> 28.9 |
| (d) host-only server table | 594,098 -> 594,098 | 45,354 -> 45,354 | 43.1 -> 41.0 (noise) |
| (e) (d) with host elision | 594,098 -> 140,946 (-76%) | 45,354 -> 14,373 (-68%) | 52.0 -> 82.9 |
| (b) `'use client'` table | 140,727 | 14,223 | 268.8 / 286.5 |
| (c) plain Fizz | 140,727 | 14,223 | 276.2 / 341.3 |

Declarative patching, 300 Suspense boundaries, Chrome 156, prod build, 10 runs per variant. "Server window" is `unstable_declarativeBatchMs` (default 300 ms, mirroring the script path's reveal throttle); 0 is the first prototype's behavior:

| | `$RC` scripts | `<template for>`, window 0 | `<template for>`, window 300 |
| --- | ---: | ---: | ---: |
| HTML bytes (excluding a shared probe script) | 94,277 | 82,518 | 82,518 (-12.5%) |
| gzip / brotli | 9,492 / 4,207 | 7,057 / 3,006 | 7,057 / 3,006 (-26% / -29%) |
| inline `<script>` elements | 303 | 2 | 2 |
| FCP / LCP (median ms) | 60 / 364 | 52 / 80 | 56 / 356 |
| first / last reveal (ms) | 344 / 646 | 66 / 536 | 344 / 644 |
| reveal updates / layouts | 2 / 3 | 25 / 21 | 3 / 4 |

Without the window the early LCP is only the missing throttle, and the reveals are about one DOM update and layout per completion. With it the cadence matches the script path and the bytes stay saved. Details, including SuspenseList and error behavior, are in `INTEGRATION.md`.

## Designs

1. **Host elision** (`enableFlightHostElision`). Server Component host elements whose whole subtree is static (host elements, text, primitive props) are not written to the stream. The server serializes them to JSON, hands `(id, json)` to a new `onElidedRow` callback, and writes a `$J<id>:<tag>` placeholder. The framework gives the rows to the Flight client that feeds SSR (`elidedRows` option) so HTML contains the content; the stream it inlines for the browser does not contain them. A client without the row renders an `ElidedHost` that adopts the existing server DOM at hydration.
2. **Payload dedupe** (`enableFlightPayloadDedupe`, server-only). Strings of 40..1023 chars that repeat are written once and referenced (`$N`, bounded to 256 KB of tracked strings). A reference to an object by a long path (>= 24 chars) is replaced by an outlined row on its second use, unless the object is an ancestor still being serialized (cycles keep pointing at the original).
3. **Declarative patching** (`enableFizzDeclarativePatching`, per-request option `unstable_declarativePatching`). Pending boundaries stream as `<!--$?--><?start name="B:n">fallback<?end><!--/$-->` and complete with `<template for="B:n">…</template>`. No scripts, no nonce. The `<!--$?-->` comment stays outside the range so React's hydration handle is never replaced; client hydration detects patching by the marker disappearing and retries via a MutationObserver. Because nothing on the client coordinates reveals any more, the server does: completed boundaries are held for a window and written together, in order, in one flush (first-frame window, then 300 ms, the same constants as the script runtime; `together` SuspenseLists and nested boundaries keep their order; a boundary is never revealed partially); an errored boundary is signalled with an inert `<template data-rcr id="E:B:n" data-dgst=…>` that the hydration observer picks up.
4. **Lazy Flight client** (`enableFlightLazyClientParser`, `enableFlightLazyTypedArrays`). Splits `encodeReply` and (optionally) typed-array parsing out of the browser client entry, loaded through `unstable_loadReplyEncoder` / `unstable_loadParserExtension`.

## Flags

| Flag | Purpose | Prototype default |
| --- | --- | --- |
| `enableFlightHostElision` | design 1 | `__EXPERIMENTAL__` (should be false upstream) |
| `enableFlightPayloadDedupe` | design 2 | `__EXPERIMENTAL__` (should be false upstream) |
| `enableFizzDeclarativePatching` | design 3 | `__EXPERIMENTAL__` (should be false upstream) |
| `enableFlightLazyClientParser`, `enableFlightLazyTypedArrays` | design 4 | false |

## Framework wiring

- **Elision:** pass `onElidedRow: (id, json) => elidedRows.set(id, json)` to the RSC render; pass `{elidedRows}` to the SSR Flight client; inline only the main stream into HTML.
- **Dedupe:** none (server-only; the existing client decodes `$N` references).
- **Lazy client:** pass `unstable_loadReplyEncoder` / `unstable_loadParserExtension` using literal `import()` so the bundler splits chunks.
- **Declarative patching:** set `unstable_declarativePatching: true` only for browsers that support `<template for>` (the detection method is undecided, see open question 3; none is implemented or tested here); everyone else gets the `$RC` path. `unstable_declarativeBatchMs` is optional (default 300, 0 = group only).

## Real-browser findings (Chrome 156, no flags needed)

- `<?start>`/`<?end>` are `ProcessingInstruction` nodes (`nodeType` 7); a patch removes them and the template; React's `$?` comment survives.
- Hydration is clean (no recoverable errors, original nodes reused) whether patches arrive before, between or after hydration; nested pending boundaries inside patched content stay patchable to three levels; boundaries are interactive while the document is still streaming.
- Two bugs were found only in the browser: (1) a patch's inline `<style>`/`<link data-precedence>` became the first hydratable child of a boundary and caused a hydration mismatch; (2) a `blocking="render"` stylesheet link inside the template stalls the parser mid-patch, after the fallback was already cleared, showing a blank gap for the whole stylesheet load. Fix: hydration skips those nodes; the link is written before `<template for>`, which delays the whole patch instead (fallback stays visible). `blocking="render"` made no observable difference.

## Risks

- **Dedupe contradicts an explicit upstream decision** ("should not dedupe strings in the model": don't hold arbitrary model strings in a map for the request's lifetime). Bounded here, but it needs a decision. It also changes cyclic output (no `Lazy` wrapper in one case).
- **Elision protocol surface:** a new `$J` row kind, a new server option and a new client option; frameworks that get the plumbing wrong ship broken pages. Static-only elision limits the win in apps with interactivity inside content.
- **Declarative patching depends on a very new browser feature and only approximates the script runtime's coordination.** The throttle runs on the server clock (it can hold a completed boundary, and the stream end, up to 300 ms), a batch is one write and not one atomic task (4-5 layouts vs 3), view transitions are impossible without a script, `together` lists stop pre-sending hidden content, stylesheet-gated boundaries block everything queued behind them, hydration relies on marker heuristics and per-boundary MutationObservers, and `<template>` content cannot create SVG/MathML/table-only elements (those boundaries fall back to scripts). Finding these needed a real browser and a comparison with the script path; the first prototype passed all of its jest tests while revealing partial boundaries and ignoring the throttle.
- **Flags default on in experimental builds** in this prototype.
- Interaction between elision and dedupe is covered by tests (no stream reference points into an elided row), but only for two first-sighting orders and a small fixture.

## Open questions

1. Is a per-boundary or per-request opt-in the right granularity for elision, and should the elided-row side channel be a first-class stream (a second `ReadableStream`) rather than a callback?
2. Should dedupe be restricted to the existing outlining threshold and made per-request state only, or is a protocol-level string/shape table (interning property names, 44% of what remains) the better investment?
3. How do we want to feature-detect `<template for>` on the server (UA sniffing vs a client hint vs a tiny inline probe), and what is the fallback when the first chunk has already been sent?
4. Can the head-of-line blocking of stylesheet-gated boundaries be avoided (e.g. hoisting the link into `<head>`-level preload plus a non-blocking patch)?
5. Should the real fix for (a) be at the API level (a way to mark props as server-only, or to send only the fields a client component reads) instead of more compression?
6. What do other browsers do with this markup (not tested), and what is the plan for Safari/Firefox timelines?
7. Is a server-side throttle the right owner for reveal pacing, or should the platform offer a way to group patches (an atomic patch group, or a render-blocking marker that works in the body) so the server does not have to guess client timing? `<link rel=expect blocking=render>` in the body did not do this in Chrome 156.

## What this does not do

It does not remove the double-data cost for client components (variant (a) is still 2.09 MB of HTML for 141 KB of markup), does not reduce SSR CPU (elided (e) is about 83 req/s vs about 341 for plain Fizz), and does not measure browser-side hydration cost for elision or dedupe. See `INTEGRATION.md`.
