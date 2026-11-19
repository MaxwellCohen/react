# HTML-first Flight over the Flight tee: corpus bytes, browser checks, timing

Measured on 2026-11-19. 41 pages, `--size full`.

## Builds

| variant | build | what it is |
|---|---|---|
| `off` | `71e7b1ee-…/scratchpad/builds-tee/oss-experimental`, React `679a7e8309` (package version `0.0.0-experimental-679a7e83-20261119`) | tee branch, `enableFlightHTMLFirst` forced on, SSR does not opt in |
| `tee` | same build as `off` | SSR opts in with `{htmlFirst: true, tee}` + `createTee` / `createFromTee` |
| `registry` | `5561229a-…/scratchpad/builds-live/all` (production-only `build-for-flight-prod`, flag forced on), built 2026-11-18 20:47 | registry design: `htmlFirst: true`, rows claimed by the in-process `createFrom*` |

The original `builds-oneflag/{off,all}` named in the brief are empty (every file under `builds-*` in session `5438c7db` was deleted on Nov 15), and no build at exactly `126b0905e5` or `231161c38d` exists. `builds-live` is the newest registry build I found. It was built from the `rH` worktree between commits `85b3ce11a6` (2026-11-18 19:27) and `c46d393f66` (21:16, fixtures only), so its React source is `85b3ce11a6`, a descendant of both `231161c38d` and `126b0905e5`. That is inferred from build time, tree state and diffs, since the build has no commit string. It has the `htmlFirst` / `htmlFirstRows` options and `__REACT_FLIGHT_HTML_FIRST_REGISTRY__`, and no `pruneForBrowser`, so `prepareVariant`'s check needed no relaxing. Its sibling `builds-live/off` is the same tree without the flag (used only for the `off` sanity check below).

## Commands

```sh
B=<builds-tee>/oss-experimental; L=<5561229a scratchpad>/builds-live
# bytes
SCN_RESULTS_DIR=$PWD/results-tee/metrics NODE_ENV=production node scenarios-metrics.js \
  --builds $B --build off=$B --build tee=$B --build registry=$L/all --variants off,registry,tee --size full --n 3
# off sanity (old build's off)
SCN_RESULTS_DIR=$PWD/results-tee/metrics-oldoff NODE_ENV=production node scenarios-metrics.js \
  --builds $B --build off=$L/off --variants off --size full --n 1
node results-tee/analyze.js > results-tee/analysis.md
# browsers
NODE_ENV=production node scenarios-check.js <same --build flags> --variants off,registry,tee --size full --browser chromium|firefox|webkit
# timing, after cp -r $B/* ./node_modules/
NODE_ENV=production node bench-tee.js --n=60
```

Harness changes: variants `off` / `registry` / `tee` (`all` kept as the old name of the registry behaviour), `--build <variant>=<dir>` per-variant build override, `tee: VARIANT === 'tee'` in the worker, `SCN_RESULTS_DIR`, `FIREFOX_PATH` / `WEBKIT_PATH` overrides next to `CHROME_PATH`. Default `--variants` is now `off,tee`.

## Totals (41 pages, full size)

| variant | gzip download | raw HTML | inlined Flight | brotli |
|---|---|---|---|---|
| off | 1,021,743 | 14,557,449 | 9,279,289 | 478,421 |
| registry | 584,858 (-42.8%) | 7,253,527 (-50.2%) | 1,975,367 (-78.7%) | 285,053 (-40.4%) |
| tee | 584,582 (-42.8%) | 7,250,515 (-50.2%) | 1,972,355 (-78.7%) | 284,500 (-40.5%) |

### registry per-page gzip
- median per-page gzip change: -8.1%
- pages within ±1%: 8 (all-client, data-grid-client-cells, full-refresh-focus, head-hoistables, repeated-object-props, server-element-via-props, server-error-in-suspense, tabs-panels-prop)
- pages larger (gzip>off): 5 (full-refresh-focus +0.8%, nested-suspense-waterfall +1.3%, repeated-long-strings +12.6%, server-element-via-props +0.7%, suspense-fallback-shown-late +1.0%)
- top-5 savers: data-grid-server-cells 134,855B, wide-tree 102,740B, huge-inline-svg 56,707B, marketing-style-jsonld 34,496B, docs-sidebar-toc 23,121B = 80.6% of total gzip saved

### tee per-page gzip
- median per-page gzip change: -8.8%
- pages within ±1%: 9 (all-client, data-grid-client-cells, full-refresh-focus, head-hoistables, nested-suspense-waterfall, repeated-object-props, server-element-via-props, suspense-fallback-shown-late, tabs-panels-prop)
- pages larger (gzip>off): 2 (nested-suspense-waterfall +0.8%, repeated-long-strings +12.5%)
- top-5 savers: data-grid-server-cells 134,864B, wide-tree 102,748B, huge-inline-svg 56,719B, marketing-style-jsonld 34,506B, docs-sidebar-toc 23,128B = 80.5% of total gzip saved

### wide-tree (largest sample)

| variant | gzip | HTML | inlined Flight | brotli |
|---|---|---|---|---|
| off | 129,367 | 983,454 | 724,264 | 46,918 |
| registry | 26,627 | 259,872 | 682 | 10,358 |
| tee | 26,619 | 259,817 | 627 | 10,353 |

### tee vs registry, pages differing >1% in any byte metric

- cart-quantity-steppers: gzip 5,761→5,757 (-0.1%), html 94,993→94,938 (-0.1%), flight 39,680→39,625 (-0.1%), brotli 3,376→3,417 (+1.2%)
- client-composition-slot: gzip 1,189→1,182 (-0.6%), html 7,426→7,371 (-0.7%), flight 744→689 (-7.4%), brotli 757→738 (-2.5%)
- client-only-wrapper: gzip 489→483 (-1.2%), html 899→844 (-6.1%), flight 681→626 (-8.1%), brotli 413→400 (-3.1%)
- dangerous-inner-html: gzip 9,839→9,834 (-0.1%), html 136,909→136,854 (-0.0%), flight 4,027→3,972 (-1.4%), brotli 4,777→4,708 (-1.4%)
- dashboard-client-widgets: gzip 3,538→3,533 (-0.1%), html 37,655→37,600 (-0.1%), flight 11,500→11,445 (-0.5%), brotli 2,327→2,299 (-1.2%)
- data-grid-server-cells: gzip 92,244→92,235 (-0.0%), html 688,318→688,263 (-0.0%), flight 677→622 (-8.1%), brotli 50,851→50,903 (+0.1%)
- deep-tree: gzip 2,895→2,893 (-0.1%), html 36,647→36,541 (-0.3%), flight 18,985→18,879 (-0.6%), brotli 1,522→1,486 (-2.4%)
- fragments-arrays-keys: gzip 731→719 (-1.6%), html 1,683→1,628 (-3.3%), flight 1,165→1,110 (-4.7%), brotli 613→596 (-2.8%)
- full-refresh-focus: gzip 616→609 (-1.1%), html 1,215→1,160 (-4.5%), flight 820→765 (-6.7%), brotli 488→484 (-0.8%)
- i18n-text-heavy: gzip 6,352→6,347 (-0.1%), html 108,541→108,486 (-0.1%), flight 8,104→8,049 (-0.7%), brotli 3,062→2,990 (-2.4%)
- islands-many-tiny: gzip 12,509→12,503 (-0.0%), html 260,745→260,690 (-0.0%), flight 64,072→64,017 (-0.1%), brotli 5,214→5,027 (-3.6%)
- keyed-list-client-reorder: gzip 564→558 (-1.1%), html 1,174→1,119 (-4.7%), flight 709→654 (-7.8%), brotli 451→443 (-1.8%)
- marketing-style-jsonld: gzip 35,529→35,519 (-0.0%), html 306,357→306,302 (-0.0%), flight 730→675 (-7.5%), brotli 19,265→19,136 (-0.7%)
- modal-children-toggle: gzip 487→481 (-1.2%), html 886→831 (-6.2%), flight 654→599 (-8.4%), brotli 418→405 (-3.1%)
- nested-suspense-waterfall: gzip 1,198→1,192 (-0.5%), html 2,990→2,935 (-1.8%), flight 1,353→1,298 (-4.1%), brotli 969→963 (-0.6%)
- server-action-form: gzip 799→794 (-0.6%), html 1,480→1,425 (-3.7%), flight 648→593 (-8.5%), brotli 617→613 (-0.6%)
- server-element-via-props: gzip 735→728 (-1.0%), html 1,781→1,726 (-3.1%), flight 1,216→1,161 (-4.5%), brotli 607→601 (-1.0%)
- server-error-in-suspense: gzip 573→565 (-1.4%), html 1,118→1,063 (-4.9%), flight 801→746 (-6.9%), brotli 460→455 (-1.1%)
- server-table-client-rows: gzip 21,212→21,205 (-0.0%), html 166,917→166,862 (-0.0%), flight 22,677→22,622 (-0.2%), brotli 8,830→8,923 (+1.1%)
- suspense-fallback-shown-late: gzip 602→594 (-1.3%), html 1,156→1,101 (-4.8%), flight 821→766 (-6.7%), brotli 487→480 (-1.4%)
- suspense-many-boundaries: gzip 5,108→5,065 (-0.8%), html 41,056→40,287 (-1.9%), flight 16,832→16,063 (-4.6%), brotli 3,051→2,948 (-3.4%)
- suspense-staggered: gzip 1,944→1,943 (-0.1%), html 10,072→10,017 (-0.5%), flight 4,342→4,287 (-1.3%), brotli 1,428→1,445 (+1.2%)
- tiny-static: gzip 421→414 (-1.7%), html 905→850 (-6.1%), flight 367→312 (-15.0%), brotli 312→307 (-1.6%)
- wide-tree: gzip 26,627→26,619 (-0.0%), html 259,872→259,817 (-0.0%), flight 682→627 (-8.1%), brotli 10,358→10,353 (-0.0%)

### off: new build vs old registry-era build (builds-live/off)

- suspense-many-boundaries: html 57,910→57,094, gzip 5,542→5,556, brotli 3,186→3,307, flight 33,686→32,870
- suspense-staggered: gzip 2,073→2,061, brotli 1,473→1,465

2 pages differ

Non-deterministic: suspense-many-boundaries/off, suspense-many-boundaries/registry, suspense-many-boundaries/tee, suspense-staggered/off, suspense-staggered/registry, suspense-staggered/tee

## Why tee and registry bytes differ

- Every page that has a stubbed region is **55 B smaller on tee** in inlined Flight (and in HTML, which contains those scripts). The registry build writes one extra final inlined chunk, `<script>(self.__FLIGHT_DATA||=[]).push(":q\n")</script>`, a `:q` end row; the tee build does not. That is why tiny pages differ by up to 6% of HTML and 15% of inlined Flight while big pages differ by 0.0%.
- `suspense-many-boundaries` and `suspense-staggered` are not byte-deterministic on any variant, `off` included (timer-driven Suspense chunking; the harness records the first render). The −1.8% / −1.9% HTML differences on those two pages and the brotli swings of about ±1% on large pages are sample noise on top of the 55 B, not a tee effect.
- `off` from the new build vs `off` from the old build is byte-identical on 39 of 41 pages; the two that differ are those same non-deterministic Suspense pages. Totals, old `off` vs new `off`: gzip 1,021,741 vs 1,021,743, HTML 14,558,265 vs 14,557,449, Flight 9,280,105 vs 9,279,289, brotli 478,308 vs 478,421.
- The baseline is slightly larger than the published one (1,021,269 gzip / 14,552,634 HTML / 9,277,674 Flight / 475,947 brotli); that was measured at an older commit (`31b26561f1`), and I did not chase the delta.

## Browser DOM-equivalence (`scenarios-check.js`, hydrated DOM, post-interaction DOM and post-navigation DOM vs `off`, no console errors)

| browser | version | result (41 pages x `off`, `registry`, `tee`) |
|---|---|---|
| Chromium (headless shell via `CHROME_PATH`) | 139.0.7258.5 | 41/41 PASS, 0 failures, both variants |
| Firefox (cached `firefox-1555` via `FIREFOX_PATH`) | 157.0 | 41/41 PASS, 0 failures |
| WebKit (cached `webkit-2370` via `WEBKIT_PATH`) | 18.4 | 41/41 PASS, 0 failures |

Firefox and WebKit are cached builds from a newer Playwright revision than the fixture's Playwright 1.51.1 expects; they launched through `executablePath` and ran the whole corpus. Nothing was downloaded. Logs: `check-chromium.log`, `check-firefox.log`, `check-webkit.log`.

## In-process timing (`bench-tee.js --n=60`, new build copied into `node_modules`)

```
server rows | baseline               median 42.73 ms  p10 40.19  html 2013869  inlined flight 1323064
server rows | tee only               median 36.28 ms  p10 33.04  html 2013308  inlined flight 1322657
server rows | html-first, no tee     median 20.03 ms  p10 18.13  html 704047  inlined flight 17148
server rows | html-first + tee       median 19.79 ms  p10 16.16  html 704053  inlined flight 17154
client rows | baseline               median 17.79 ms  p10 15.56  html 1695819  inlined flight 626830
client rows | tee only               median 16.91 ms  p10 14.58  html 1695666  inlined flight 626719
client rows | html-first, no tee     median 16.93 ms  p10 14.99  html 1282185  inlined flight 213294
client rows | html-first + tee       median 15.36 ms  p10 13.92  html 1282191  inlined flight 213300
```

Single noisy machine, median of 60 renders; compare rows within a workload.

## Files

`metrics/scenarios.json`, `metrics/RESULTS-SCENARIOS.md` (per page, all variants), `metrics-oldoff/`, `analysis.md`, `analyze.js`, `check-*.log`, `bench-tee.txt`. Timing columns in `metrics/` come from N=3 renders and are not meaningful.
