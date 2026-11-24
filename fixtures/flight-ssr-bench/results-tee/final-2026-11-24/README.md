# Final validation, PR #28 head `663228549c` (2026-11-24)

Fresh experimental production builds of the head. `off` = flag false, `all` = `enableFlightHTMLFirst` forced true.
Chromium 139 headless shell, Firefox 159, Apple silicon Mac.

```
B=<dir with off/ and all/>; cd fixtures/flight-ssr-bench
SCENARIO_BUILDS=$B yarn scenarios:check --size full [--browser firefox]      # check-chromium.log, check-firefox.log
SCENARIO_BUILDS=$B yarn scenarios:check --size smoke [--browser firefox]     # check-*-smoke.log
SCENARIO_BUILDS=$B SCN_RESULTS_DIR=metrics yarn scenarios:metrics --size full --n 1 --variants off,all
SCENARIO_BUILDS=$B SCN_RESULTS_DIR=hydration yarn scenarios:hydration --size full --n 15 --variants off,all --only tiny-stubs-many,islands-many-tiny,server-table-client-rows,data-grid-client-cells,data-grid-server-cells,product-listing,realistic-storefront,client-aschild-slot,cart-quantity-steppers
python3 -I results-tee/final-2026-11-23/analyze-final.py metrics > totals.md
```

- Check, smoke: Chromium 45/45, Firefox 45/45.
- Check, full: Chromium 44/45, Firefox 44/45. `client-children-inspect` fails at full size in both `off` and `all`
  (its `expectCount` of 3 `.filter li` is written for smoke size; 60 match at full), so it is a scenario sizing issue, not the flag.
- `scenarios:metrics` exits 1 on its non-determinism note (`client-suspends-in-ssr/all`, `suspense-many-boundaries/off,all`, `suspense-staggered/all`).
- Totals and tables: `totals.md`, `metrics/RESULTS-SCENARIOS.md`, `hydration/RESULTS-HYDRATION.md`.
