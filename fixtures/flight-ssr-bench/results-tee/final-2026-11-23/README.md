# Final corpus results, `night/html-first-on-tee` @ d1d54751a9 (2026-11-23)

Builds: experimental production builds of react, react-dom, scheduler, react-server-dom-webpack from the final source
(`MIN_STUB_WEIGHT` 48); `off` = flag false, `all` = `enableFlightHTMLFirst` forced true. Machine: Apple silicon Mac, quiet.

```
B=<dir with off/ and all/>; cd fixtures/flight-ssr-bench
SCENARIO_BUILDS=$B yarn scenarios:check --size smoke                     # check-chromium.log: 45/45 PASS
SCENARIO_BUILDS=$B yarn scenarios:check --size smoke --browser firefox   # check-firefox.log: 45/45 PASS (Firefox 159, FIREFOX_PATH set)
SCENARIO_BUILDS=$B SCN_RESULTS_DIR=metrics yarn scenarios:metrics --size full --n 1
SCENARIO_BUILDS=$B SCN_RESULTS_DIR=hydration yarn scenarios:hydration --size full --n 15 --only tiny-stubs-many,islands-many-tiny,server-table-client-rows,data-grid-client-cells,data-grid-server-cells,product-listing,realistic-storefront,client-aschild-slot,cart-quantity-steppers
python3 -I analyze-final.py metrics > totals.md
```
`scenarios:metrics` exits 1 because of its non-determinism note (`suspense-many-boundaries/off`, `/all`, `suspense-staggered/all`: byte counts differ between renders); the tables use the single render it took.

## Totals
See `totals.md` (generated). Summary, gzip / raw HTML / inlined Flight / brotli, off -> on:

- 41 original pages: 1,023,745 -> 594,628 (-41.9%) / 14,560,723 -> 7,675,454 (-47.3%) / 9,282,481 -> 2,397,212 (-74.2%) / 478,282 -> 293,860 (-38.6%); 18,266 stubs.
- 45 pages: 1,089,665 -> 651,644 (-40.2%) / 15,557,536 -> 8,490,981 (-45.4%) / 9,940,425 -> 2,873,870 (-71.1%) / 505,594 -> 317,231 (-37.3%); 19,366 stubs.
- Larger than off (gzip): repeated-long-strings +1461 B, server-error-in-suspense +17, head-hoistables +5, suspense-fallback-shown-late +3, deep-tree +2.
- Median page gzip saving: 6.2% (41 pages), 3.6% (45 pages); 261 B median in both.
- Top 5 by absolute gzip saving: data-grid-server-cells, wide-tree, huge-inline-svg, marketing-style-jsonld, docs-sidebar-toc = 82.0% of the 41-page saving (80.3% of the 45-page saving).

## Hydration (CPU throttle 4x, N=15, hydrate ms median [p25-p75])
| scenario | off | on | on vs off |
|---|---|---|---|
| tiny-stubs-many | 71.4 [70.7-71.8] | 70.5 [69.6-71.8] | -1% |
| islands-many-tiny | 36.9 [36.8-37.4] | 40.3 [39.8-40.8] | +9% |
| server-table-client-rows | 61.6 [60.8-62.1] | 39.7 [39.2-40.6] | -36% |
| data-grid-client-cells | 59.6 [59.3-60.8] | 60.5 [60.1-61.5] | +2% |
| data-grid-server-cells | 97.9 [96.4-98.9] | 22.0 [21.6-22.2] | -78% |
| product-listing | 77.6 [76.1-77.9] | 80.7 [79.6-81.1] | +4% |
| realistic-storefront | 36.8 [36.2-37.3] | 37.2 [36.6-37.5] | +1% |
| client-aschild-slot | 34.2 [33.5-34.5] | 36.9 [36.4-37.5] | +8% |
| cart-quantity-steppers | 30.6 [30.2-31.1] | 30.8 [30.6-31.1] | +1% |

## What the copies cost (`timing/`)
`bench-tee.js`, 1000 rows, `NODE_ENV=production`, build copied into `node_modules` (`cp -r $B/all/* node_modules/`).
`timing/bench-tee-final.txt`: `node bench-tee.js --n=60` (median ms/render):

| | baseline | tee only | HTML-first + tee |
|---|---|---|---|
| server rows | 41.06 | 34.50 | 16.28 |
| client rows | 16.37 | 15.00 | 14.76 |

Three-way, HTML-first + tee, 60 runs each (6 rounds x 10 runs, builds alternating per round; `timing/raw-interleaved`),
`bench-tee.js --n=10 "--modes=baseline,html-first + tee" --raw=...`:
variants: final; nocopy = `copyStaticHostElement` returns the server's own `node` after the props loop and style/script check;
noe = copies kept, `teeDispatcher.e(tee)` call removed (HTMLFirst-test: 75/75 pass with that patch).

| page | variant | median | p10-p90 | min-max | ratio to final |
|---|---|---|---|---|---|
| server rows | final | 15.73 | 14.27-29.84 | 14.15-34.75 | 1.000 |
| server rows | nocopy | 15.39 | 13.85-31.21 | 13.66-37.14 | 0.978 |
| server rows | noe | 15.61 | 14.31-28.76 | 14.01-32.09 | 0.993 |
| client rows | final | 14.51 | 13.44-15.29 | 13.07-19.43 | 1.000 |
| client rows | nocopy | 15.16 | 13.87-16.27 | 13.59-17.51 | 1.045 |
| client rows | noe | 14.48 | 13.44-15.51 | 13.25-18.71 | 0.998 |
| server rows baseline | final / nocopy / noe | 39.52 / 40.54 / 39.78 | | | 1.000 / 1.026 / 1.006 |
| client rows baseline | final / nocopy / noe | 16.14 / 16.44 / 16.34 | | | 1.000 / 1.018 / 1.012 |

Baseline is the same code in all three builds, so its ratios (up to 1.026) are the noise floor between builds.

CPU profile of final, HTML-first + tee, server rows, 200 renders (`bench-tee.js --n=200 "--modes=html-first + tee" "--apps=server rows" --cpuprof=...`,
inspector profiler started right before the timed loop, 100 us sampling), self time:
writeChunk 17.9%, GC 10.0%, #encodeInto 5.7%, copyStaticHostNode 5.7%, copyStaticHostElement 5.6%, (anon) 4.9%, encodeInto 4.4%,
flushSubtree 3.7%, inspector `post` 3.6%, checkStaticTaint 3.1%, escapeTextForBrowser 3.0%, byteLengthOfChunk 2.3%,
pushStartGenericElement 2.2%, renderElement 2.1%, generateProducts 1.8%.
copyStaticHostNode 5.68%, copyStaticHostElement 5.56%, checkStaticTaint 3.07%, staticWeight 0.17%, copyStaticPropValue 0.14%;
tee element code (`e`, `m`, and their helpers `d`, `w` in the client build) under 0.1% together (V8 inlines most of it into copyStaticHostElement; client-side `createElement` 0.74% is the SSR reader).
