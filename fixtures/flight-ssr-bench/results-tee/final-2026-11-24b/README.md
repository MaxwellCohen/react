# Final validation, PR #28 head `2821c32249` (2026-11-24, second run)

Fresh experimental production builds. `off` = flag false, `all` = `enableFlightHTMLFirst` forced true. Chromium 139, Firefox 159.
Commands are those of `../final-2026-11-24/README.md`, with `--variants off,all`; hydration ran on 15 pages (N=15, 4x throttle).

- Check, smoke: Chromium 45/45, Firefox 45/45.
- Check, full: Chromium 44/45, Firefox 44/45. `client-children-inspect` fails in `off` and `all` alike (its expected count is for smoke size).
- Totals: `totals.md`. Hydration: `hydration-table.md`, `hydration/RESULTS-HYDRATION.md`.
