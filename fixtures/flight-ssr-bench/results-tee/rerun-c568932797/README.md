# Harness rerun on PR #28 head `c568932797` (2026-11-23)

Same commands as `../final-2026-11-23/README.md`, on fresh experimental production builds of the PR head
(HTML-first on Andrew's `flight-value-path` at `b61b8df489`, with patching in place folded in).
`off` = flag false, `all` = `enableFlightHTMLFirst` forced true.

- `check-chromium.log`: 45/45 PASS (Chromium 139). `check-firefox.log`: 45/45 PASS (Firefox 159).
- `totals.md`: 41 original pages gzip 1,021,753 -> 592,662 (-42.0%), inlined Flight 9,280,168 -> 2,394,746 (-74.2%), brotli -38.7%; 45 pages gzip -40.3%.
- `hydration/RESULTS-HYDRATION.md`: 4x CPU throttle, N=15. data-grid-server-cells 99.8 -> 22.0 ms (-78%), server-table-client-rows 64.1 -> 41.4 ms (-35%); no page more than 9% slower.

`scenarios:metrics` exits 1 because of its non-determinism note (Suspense-heavy pages vary between renders).
