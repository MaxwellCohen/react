# RSC double-data baseline (1000-row table)

Base commit: a58f939795 (unmodified React build). Node v26.13.0, macOS arm64, `NODE_ENV=production`.
Script: `bench-table.js` (autocannon, 100 warmup + 500 requests per concurrency; req/s = `1000/latency.mean*connections`, same formula as `bench-server.js`).

| Variant | HTML bytes | HTML gzip | Inlined Flight bytes | Inlined Flight gzip | req/s c=1 | req/s c=10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| (a) server component + Flight inlined | 2,500,026 | 149,680 | 1,650,803 | 109,090 | 21.2 | 17.8 |
| (b) `'use client'` table, no Flight | 140,727 | 14,223 | 0 | - | 91.7 | 110.6 |
| (c) plain Fizz | 140,727 | 14,223 | 0 | - | 146.8 | 193.9 |

Notes
- (a) uses the existing `ProductTable`/`TableRow` (server table, client rows, Badge, Pagination, full product objects incl. reviews/specs passed as props). Its HTML minus Flight is ~849 KB, so (a) renders far more markup than (b)/(c), which are a lean 7-column table. The Flight payload is 66% of (a)'s response; (a) vs (b)/(c) is not a pure "same markup" comparison.
- (b) and (c) produce byte-identical HTML (b = `src/TableClient.js` re-exporting `src/TablePlain.js`, rendered by Fizz directly). Their req/s gap (91.7 vs 146.8) is run-order/noise, not a real difference; treat as ~noise floor of this harness.
- All tables are wrapped in `<Suspense>` because Fizz errors on >512 kB documents without a boundary.
- Single run each; no variance estimate.

## Re-run (from repo root, in any worktree)

```sh
yarn install
yarn build-for-flight-prod
cd fixtures/flight-ssr-bench
yarn install
cp -r ../../build/oss-experimental/* ./node_modules/
NODE_ENV=production node bench-table.js --rows=1000 --json-out=build/table-results.json
```

Files: `bench-table.js`, `src/TableServer.js`, `src/TableClient.js`, `src/TablePlain.js`; one-line export added to `src/entry-rsc.js`.
