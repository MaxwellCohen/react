# Benchmark results: HTML-first elision, server-component output only

Same machine, same session (Apple Silicon, Node 20+, `NODE_ENV=production`, 1000 rows). React built with
`enableFlightHtmlFirst`, `enableFlightHtmlFirst`, `enableFlightHtmlFirst` on. Absolute timings are noisier and
slower than the numbers originally quoted in HEAD 1930da7cf8's HTML-FIRST.md (that run: 130 ms "today" hydration;
this machine/browser: 171 ms for the same arm), so compare within a table, not across machines.

"Before" = HEAD 1930da7cf8 (`unstable_pruneForBrowser`, client rows pruned). "After" = this change (no pruning; client
components untouched; the page's rows are server components that render plain `<tr>`).

## Full page (inline CSS 244KB + JSON-LD 143KB + chrome + 1000 rows, every 100th row interactive), real Chromium

Bytes are deterministic. Hydration = in-page timestamp of first committed hydration, median of 9 (this machine).

| variant | HTML bytes | gzip | inlined Flight | hydration (ms) |
|---|---|---|---|---|
| BEFORE, flag off ("today": client rows, full Flight) | 1,697,853 | 141,102 | 627,528 | 130 (original run) |
| BEFORE, flag on, client rows pruned | 1,085,345 | 73,616 | 15,021 | 114 (original run) |
| AFTER, client-component rows, flag off | 1,697,853 | 141,102 | 627,528 | 171 |
| AFTER, client-component rows, flag on (live) | 1,284,218 | 96,943 | 213,894 | 155 |
| AFTER, server-component rows, flag off | 2,801,334 | 156,090 | 1,729,029 | 274 |
| AFTER, server-component rows, flag on (JSON rows) | 1,087,295 | 74,282 | 16,971 | 174 |
| AFTER, server-component rows, flag on (live rows) | **1,087,295** | **74,282** | **16,971** | **152** |

All five AFTER arms in the browser: 1000/1000 rows adopt the same DOM node, `<style>` and JSON-LD same node, zero console
problems, zero recoverable errors, mid-table counter works, navigation to a 20-row page replaces the stubs.

### What moved and why
- **Client-row page (the honest "client components are untouched" case):** 1,697,853 -> 1,284,218 B (-413,635), gzip
  141,102 -> 96,943, Flight 627,528 -> 213,894. The 244KB CSS and 143KB JSON-LD are server-rendered host elements, so they still
  elide. The 1000 client rows stay in Flight (213,894 B, ~214 B/row of props); that is what was pruned before and is
  now the cost of keeping client components intact. Versus the old pruned numbers: +199,000 B HTML, +23,000 B gzip,
  +198,873 B Flight.
- **Server-row page:** 1,087,295 B vs 1,085,345 B before (+1,950 B HTML, +1,950 B Flight, +0.7 KB gzip). Same elision
  effect, now with the rows being server output instead of pruned client elements. The small delta is the per-row `$J<id>:tr` refs
  and keys (not isolated further). Flight stays ~17 KB because every elided `<tr>` still costs a ref.
- **Fixture content changed:** server rows with the flag off are much bigger (2.8 MB, 1.73 MB Flight) than client rows
  (the full `<tr>` tree is serialized, versus a props-only client reference). So server rows are not a free comparison to client
  rows; the elision brings them back down to ~the Fizz floor.
- **Hydration:** server-row elided = 152/174 ms vs 274 ms for the same page without elision (-45%/-37%). Client-row elided
  155 ms vs 171 ms (-9%). Run-to-run noise on this machine is about +/-10 ms.
- **Not elided any more:** client components, their props, module rows. The old "module row of a stubbed component never
  reaches the browser" saving is gone by design.

## Server render, same page, interleaved in-process, median ms (`yarn bench:inproc`, 60 iterations)

| variant | BEFORE ms | AFTER ms |
|---|---|---|
| pure Fizz floor | 12.9 | 16.2 |
| flag off, client rows | 20.4 | 23.6 |
| flag on, client rows, live | n/a | 22.8 |
| flag off, server rows | n/a | 62.4 |
| flag on, pruned client rows, JSON rows | 18.7 | n/a |
| flag on, pruned client rows, live | 16.6 | n/a |
| flag on, server rows, JSON rows | n/a | 44.4 |
| flag on, server rows, live | n/a | 24.2 |

(The two runs ran minutes apart; the Fizz floor moved 12.9 -> 16.2, i.e. the machine was ~25% slower during the AFTER run.
Normalized to the floor: BEFORE live 1.29x floor, AFTER server-rows live 1.49x, AFTER client-rows live 1.41x.)

- Server-component rows cost more than pruned client rows ever did: the server really renders 1000 Server Components
  and builds 1000 `<tr>` trees (pruned client rows were never rendered on the server, only referenced). Live hand-off removes the
  stringify/parse so it lands near the client-row case (24 ms) instead of 44 ms for JSON rows.
- JSON-row mode is the expensive one for server rows (stringify of every row): 44.4 ms vs 24.2 live.

## Table variants, requests/s (`bench-table.js`, autocannon, concurrency 1 / 10)

| variant | HTML B | gzip | Flight B | BEFORE req/s c1/c10 | AFTER req/s c1/c10 |
|---|---|---|---|---|---|
| `h-table-lean` client rows, flag off | 903,411 | 52,365 | 214,540 | 56.1 / 55.1 | 57.8 / 55.8 |
| `h-table-lean-elided` client rows, flag on | 902,949 | 52,274 | 214,078 | 58.2 / 56.2 | 59.9 / 56.6 |
| static table, elided (BEFORE: pruned client rows; AFTER: server rows) | 689,363 -> 702,157 | 25,978 -> 28,342 | 492 -> 13,286 | 69.0 / 65.4 | 28.1 / 27.5 |
| `f-style-elided` (CSS only) | 384,989 | 45,068 | 320 | 57.4 / 58.5 | 77.8 / 75.8 |
| `g-jsonld-elided` | 284,157 | 27,526 | 321 | 58.1 / 57.0 | 79.5 / 77.7 |
| `k-fizz-same-markup` (floor) | 688,871 | 25,605 | 0 | 89.7 / 83.2 | 82.4 / 78.9 |

(`f-style`/`g-jsonld` rows were already server-rendered before and after; their req/s differences are machine noise between runs,
bytes are identical.) Page routes added in this change (not available before):

| route | HTML B | gzip | Flight B | req/s c1 / c10 |
|---|---|---|---|---|
| `n-page-client-rows` (flag off) | 1,697,813 | 141,066 | 627,529 | 46.7 / 52.6 |
| `n-page-client-rows-live` | 1,284,178 | 96,901 | 213,894 | 60.9 / 40.7 |
| `o-page-server-rows` (flag off) | 2,801,294 | 156,057 | 1,731,010 | 11.8 / 17.4 |
| `o-page-server-rows-json` | 1,087,255 | 74,244 | 16,971 | 18.1 / 22.6 |
| `o-page-server-rows-live` | 1,087,255 | 74,244 | 16,971 | 56.1 / 49.3 |

- The big req/s drop for the static table (65-69 -> 27-28) is the cost of really rendering and serializing 1000 server rows (JSON mode). Live mode
  (`l-table-static` live) is covered by the in-process numbers above; the bench-table route uses JSON rows.
- The static server table now emits one `$J` ref per row (13,286 B Flight, 2,474 B gz) where pruned client rows collapsed
  the whole table into one ref (492 B), because Server Components in the tree are not resolved yet when static-ness is decided. Collapsing
  runs of sibling rows is listed as follow-up.
