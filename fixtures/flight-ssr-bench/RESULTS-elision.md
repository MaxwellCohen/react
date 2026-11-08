# Host elision (enableFlightHostElision), 1000-row table

Same harness/machine run as the baseline rows (a)-(c) (`bench-table.js --rows=1000`), Node v26.13.0, `NODE_ENV=production`, single run each. (a)/(b)/(c) bytes reproduce `RESULTS-baseline.md` exactly; req/s drifts with machine noise (b/c ran ~1.4-2x faster than in the baseline file), so compare req/s only within this table.

| Variant | HTML bytes | HTML gzip | Inlined Flight bytes | Inlined Flight gzip | req/s c=1 | req/s c=10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (a) server component (client rows) + Flight inlined | 2,500,026 | 149,681 | 1,650,803 | 109,090 | 20.4 | 18.5 |
| (d) lean host-only table as server component + Flight inlined (no elision) | 594,098 | 45,354 | 453,371 | 30,678 | 32.3 | 45.1 |
| (e) same as (d) with host elision | 140,946 | 14,373 | 219 | 169 | 94.6 | 105.9 |
| (b) `'use client'` table, no Flight | 140,727 | 14,223 | 0 | - | 208.8 | 279.9 |
| (c) plain Fizz | 140,727 | 14,223 | 0 | - | 216.9 | 318.1 |

- (d)/(e) render the same markup as (b)/(c) (`src/TableServerHost.js` = `TablePlain`). (a) is not elidable: its rows are client references.
- (e) HTML = (c) + 219 B of Flight. SSR still pays for serializing the table once (JSON string handed to `onElidedRow`), parsing it in the Flight client, and Fizz, hence ~95 vs ~217 req/s.
- Not measured here: browser hydration of (e) (covered by the jest test, not this harness).
