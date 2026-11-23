# Scenario corpus results

size=full, N=1 interleaved renders per cell, builds=`/private/tmp/claude-501/-Users-maxcohen-code-react-ecosystem/d4b14db0-012e-4635-a1be-6203fc5af593/scratchpad/builds-final`. Bytes are deterministic; times are in-process Flight->Fizz render (median ms [Q1-Q3]) and noisy on a shared machine.
Percentages are vs the flags-off build. REGRESSION: any bytes +0.5% or time ratio >1.05 with non-overlapping IQRs. NO-BENEFIT: gzip change within +-1%.

| scenario | expected | variant | HTML B | gzip B | brotli B | inlined Flight B | median ms [IQR] | time x off | flags |
|---|---|---|---|---|---|---|---|---|---|
| all-client | none | off | 5340 | 999 | 631 | 369 | 1.23 [1.23-1.23] | 1.00 |  |
| all-client | none | all | 5340 (0.0%) | 999 (0.0%) | 631 (0.0%) | 369 (0.0%) | 1.43 [1.43-1.43] | 1.16 | REGRESSION NO-BENEFIT |
| attributes-styles-aria | high | off | 1132171 | 52952 | 30102 | 704097 | 25.98 [25.98-25.98] | 1.00 |  |
| attributes-styles-aria | high | all | 806544 (-28.8%) | 43812 (-17.3%) | 25476 (-15.4%) | 378470 (-46.2%) | 14.18 [14.18-14.18] | 0.55 |  |
| blog-article | high | off | 1003824 | 27033 | 12581 | 562734 | 8.27 [8.27-8.27] | 1.00 |  |
| blog-article | high | all | 555812 (-44.6%) | 23624 (-12.6%) | 12052 (-4.2%) | 114722 (-79.6%) | 5.77 [5.77-5.77] | 0.70 |  |
| cart-quantity-steppers | low | off | 128177 | 7116 | 4340 | 72864 | 2.38 [2.38-2.38] | 1.00 |  |
| cart-quantity-steppers | low | all | 101343 (-20.9%) | 6047 (-15.0%) | 3695 (-14.9%) | 46030 (-36.8%) | 1.82 [1.82-1.82] | 0.76 |  |
| client-aschild-slot | low | off | 145719 | 9305 | 4115 | 96048 | 2.99 [2.99-2.99] | 1.00 |  |
| client-aschild-slot | low | all | 118062 (-19.0%) | 8970 (-3.6%) | 3936 (-4.3%) | 68391 (-28.8%) | 2.48 [2.48-2.48] | 0.83 |  |
| client-children-inspect | low | off | 23634 | 2398 | 1546 | 14278 | 0.78 [0.78-0.78] | 1.00 |  |
| client-children-inspect | low | all | 23634 (0.0%) | 2398 (0.0%) | 1546 (0.0%) | 14278 (0.0%) | 0.60 [0.60-0.60] | 0.77 | NO-BENEFIT |
| client-composition-slot | low | off | 21012 | 3009 | 1486 | 14330 | 0.68 [0.68-0.68] | 1.00 |  |
| client-composition-slot | low | all | 21012 (0.0%) | 3009 (0.0%) | 1486 (0.0%) | 14330 (0.0%) | 0.68 [0.68-0.68] | 1.00 | NO-BENEFIT |
| client-only-wrapper | low | off | 1069 | 553 | 450 | 851 | 0.17 [0.17-0.17] | 1.00 |  |
| client-only-wrapper | low | all | 1069 (0.0%) | 553 (0.0%) | 450 (0.0%) | 851 (0.0%) | 0.15 [0.15-0.15] | 0.88 | NO-BENEFIT |
| client-suspends-in-ssr | high | off | 258524 | 18910 | 8190 | 167783 | 24.31 [24.31-24.31] | 1.00 |  |
| client-suspends-in-ssr | high | all | 104946 (-59.4%) | 10354 (-45.2%) | 4345 (-46.9%) | 14205 (-91.5%) | 19.95 [19.95-19.95] | 0.82 |  |
| comments-thread-recursive | high | off | 426843 | 13781 | 10582 | 280225 | 6.50 [6.50-6.50] | 1.00 |  |
| comments-thread-recursive | high | all | 195167 (-54.3%) | 9881 (-28.3%) | 6839 (-35.4%) | 48549 (-82.7%) | 3.65 [3.65-3.65] | 0.56 |  |
| dangerous-inner-html | high | off | 316613 | 19819 | 9807 | 183731 | 2.48 [2.48-2.48] | 1.00 |  |
| dangerous-inner-html | high | all | 136929 (-56.8%) | 9893 (-50.1%) | 4774 (-51.3%) | 4047 (-97.8%) | 1.16 [1.16-1.16] | 0.47 |  |
| dashboard-client-widgets | low | off | 42057 | 3956 | 2593 | 15902 | 1.01 [1.01-1.01] | 1.00 |  |
| dashboard-client-widgets | low | all | 40238 (-4.3%) | 3695 (-6.6%) | 2408 (-7.1%) | 14083 (-11.4%) | 1.07 [1.07-1.07] | 1.06 | REGRESSION |
| data-grid-client-cells | none | off | 536709 | 69656 | 34025 | 331181 | 15.13 [15.13-15.13] | 1.00 |  |
| data-grid-client-cells | none | all | 535253 (-0.3%) | 69598 (-0.1%) | 34110 (+0.2%) | 329725 (-0.4%) | 12.95 [12.95-12.95] | 0.86 | NO-BENEFIT |
| data-grid-server-cells | high | off | 2298820 | 227145 | 111910 | 1611179 | 48.38 [48.38-48.38] | 1.00 |  |
| data-grid-server-cells | high | all | 688396 (-70.1%) | 92337 (-59.3%) | 51049 (-54.4%) | 755 (-100.0%) | 16.33 [16.33-16.33] | 0.34 |  |
| deep-tree | high | off | 47205 | 3142 | 1670 | 29543 | 1.17 [1.17-1.17] | 1.00 |  |
| deep-tree | high | all | 47256 (+0.1%) | 3144 (+0.1%) | 1597 (-4.4%) | 29594 (+0.2%) | 1.04 [1.04-1.04] | 0.89 | NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| docs-sidebar-toc | high | off | 697966 | 39534 | 17584 | 456024 | 11.83 [11.83-11.83] | 1.00 |  |
| docs-sidebar-toc | high | all | 251345 (-64.0%) | 16450 (-58.4%) | 6919 (-60.7%) | 9403 (-97.9%) | 4.13 [4.13-4.13] | 0.35 |  |
| form-controls-uncontrolled | high | off | 324437 | 26416 | 9262 | 208313 | 6.07 [6.07-6.07] | 1.00 |  |
| form-controls-uncontrolled | high | all | 317878 (-2.0%) | 26091 (-1.2%) | 9922 (+7.1%) | 201754 (-3.1%) | 5.39 [5.39-5.39] | 0.89 | REGRESSION |
| fragments-arrays-keys | low | off | 2055 | 793 | 646 | 1537 | 0.25 [0.25-0.25] | 1.00 |  |
| fragments-arrays-keys | low | all | 2055 (0.0%) | 793 (0.0%) | 646 (0.0%) | 1537 (0.0%) | 0.22 [0.22-0.22] | 0.86 | NO-BENEFIT |
| full-refresh-focus | low | off | 1270 | 661 | 528 | 875 | 0.39 [0.39-0.39] | 1.00 |  |
| full-refresh-focus | low | all | 1270 (0.0%) | 661 (0.0%) | 528 (0.0%) | 875 (0.0%) | 0.32 [0.32-0.32] | 0.81 | NO-BENEFIT |
| head-hoistables | low | off | 66593 | 4841 | 2799 | 40018 | 1.22 [1.22-1.22] | 1.00 |  |
| head-hoistables | low | all | 66542 (-0.1%) | 4846 (+0.1%) | 2758 (-1.5%) | 39967 (-0.1%) | 1.12 [1.12-1.12] | 0.92 | NO-BENEFIT |
| huge-inline-svg | high | off | 1181380 | 113810 | 48553 | 736827 | 28.20 [28.20-28.20] | 1.00 |  |
| huge-inline-svg | high | all | 570955 (-51.7%) | 57132 (-49.8%) | 20952 (-56.8%) | 126402 (-82.8%) | 16.18 [16.18-16.18] | 0.57 |  |
| i18n-text-heavy | high | off | 251241 | 11165 | 5962 | 150804 | 5.42 [5.42-5.42] | 1.00 |  |
| i18n-text-heavy | high | all | 108554 (-56.8%) | 6378 (-42.9%) | 3015 (-49.4%) | 8117 (-94.6%) | 2.12 [2.12-2.12] | 0.39 |  |
| islands-many-tiny | low | off | 428827 | 14703 | 6882 | 232154 | 3.78 [3.78-3.78] | 1.00 |  |
| islands-many-tiny | low | all | 260765 (-39.2%) | 12561 (-14.6%) | 5154 (-25.1%) | 64092 (-72.4%) | 4.32 [4.32-4.32] | 1.14 | REGRESSION |
| keyed-list-client-reorder | low | off | 1486 | 624 | 510 | 1021 | 0.26 [0.26-0.26] | 1.00 |  |
| keyed-list-client-reorder | low | all | 1486 (0.0%) | 624 (0.0%) | 510 (0.0%) | 1021 (0.0%) | 0.21 [0.21-0.21] | 0.78 | NO-BENEFIT |
| marketing-style-jsonld | high | off | 624283 | 70074 | 23882 | 318656 | 2.53 [2.53-2.53] | 1.00 |  |
| marketing-style-jsonld | high | all | 306454 (-50.9%) | 35579 (-49.2%) | 19323 (-19.1%) | 827 (-99.7%) | 1.93 [1.93-1.93] | 0.76 |  |
| modal-children-toggle | low | off | 1026 | 555 | 449 | 794 | 0.22 [0.22-0.22] | 1.00 |  |
| modal-children-toggle | low | all | 1026 (0.0%) | 555 (0.0%) | 449 (0.0%) | 794 (0.0%) | 0.21 [0.21-0.21] | 0.97 | NO-BENEFIT |
| nested-layouts-context | low | off | 89840 | 5295 | 2665 | 55577 | 1.56 [1.56-1.56] | 1.00 |  |
| nested-layouts-context | low | all | 40167 (-55.3%) | 3126 (-41.0%) | 1617 (-39.3%) | 5904 (-89.4%) | 0.90 [0.90-0.90] | 0.58 |  |
| nested-suspense-waterfall | low | off | 3159 | 1232 | 1004 | 1522 | 98.25 [98.25-98.25] | 1.00 |  |
| nested-suspense-waterfall | low | all | 3159 (0.0%) | 1232 (0.0%) | 1004 (0.0%) | 1522 (0.0%) | 98.81 [98.81-98.81] | 1.01 | NO-BENEFIT |
| product-detail-reviews | high | off | 391180 | 16502 | 11495 | 236793 | 4.89 [4.89-4.89] | 1.00 |  |
| product-detail-reviews | high | all | 161999 (-58.6%) | 8580 (-48.0%) | 5854 (-49.1%) | 7612 (-96.8%) | 2.04 [2.04-2.04] | 0.42 |  |
| product-listing | high | off | 1133629 | 55794 | 24789 | 747447 | 21.20 [21.20-21.20] | 1.00 |  |
| product-listing | high | all | 916849 (-19.1%) | 54285 (-2.7%) | 27255 (+9.9%) | 530667 (-29.0%) | 16.61 [16.61-16.61] | 0.78 | REGRESSION |
| realistic-storefront | high | off | 156354 | 12250 | 6500 | 101545 | 2.95 [2.95-2.95] | 1.00 |  |
| realistic-storefront | high | all | 153988 (-1.5%) | 11338 (-7.4%) | 6148 (-5.4%) | 99179 (-2.3%) | 2.95 [2.95-2.95] | 1.00 |  |
| repeated-long-strings | low | off | 1016774 | 11732 | 4420 | 607479 | 5.72 [5.72-5.72] | 1.00 |  |
| repeated-long-strings | low | all | 622270 (-38.8%) | 13193 (+12.5%) | 4819 (+9.0%) | 212975 (-64.9%) | 4.43 [4.43-4.43] | 0.77 | REGRESSION |
| repeated-object-props | low | off | 67490 | 2813 | 1560 | 39920 | 1.52 [1.52-1.52] | 1.00 |  |
| repeated-object-props | low | all | 67490 (0.0%) | 2813 (0.0%) | 1560 (0.0%) | 39920 (0.0%) | 1.52 [1.52-1.52] | 1.00 | NO-BENEFIT |
| server-action-form | low | off | 1632 | 873 | 681 | 800 | 0.20 [0.20-0.20] | 1.00 |  |
| server-action-form | low | all | 1632 (0.0%) | 873 (0.0%) | 681 (0.0%) | 800 (0.0%) | 0.18 [0.18-0.18] | 0.88 | NO-BENEFIT |
| server-element-via-props | low | off | 1839 | 779 | 637 | 1274 | 0.35 [0.35-0.35] | 1.00 |  |
| server-element-via-props | low | all | 1839 (0.0%) | 779 (0.0%) | 637 (0.0%) | 1274 (0.0%) | 0.25 [0.25-0.25] | 0.72 | NO-BENEFIT |
| server-error-in-suspense | low | off | 1312 | 626 | 512 | 995 | 0.23 [0.23-0.23] | 1.00 |  |
| server-error-in-suspense | low | all | 1394 (+6.3%) | 643 (+2.7%) | 532 (+3.9%) | 1077 (+8.2%) | 0.23 [0.23-0.23] | 0.96 | REGRESSION |
| server-table-client-rows | high | off | 635617 | 42261 | 21740 | 491377 | 14.39 [14.39-14.39] | 1.00 |  |
| server-table-client-rows | high | all | 173668 (-72.7%) | 22875 (-45.9%) | 9408 (-56.7%) | 29428 (-94.0%) | 6.43 [6.43-6.43] | 0.45 |  |
| suspense-fallback-shown-late | low | off | 1290 | 645 | 524 | 955 | 0.26 [0.26-0.26] | 1.00 |  |
| suspense-fallback-shown-late | low | all | 1243 (-3.6%) | 648 (+0.5%) | 538 (+2.7%) | 908 (-4.9%) | 0.22 [0.22-0.22] | 0.83 | REGRESSION NO-BENEFIT |
| suspense-many-boundaries | low | off | 57565 | 5592 | 3362 | 33341 | 64.40 [64.40-64.40] | 1.00 | NONDETERMINISTIC-BYTES |
| suspense-many-boundaries | low | all | 41218 (-28.4%) | 5142 (-8.0%) | 3057 (-9.1%) | 16994 (-49.0%) | 66.40 [66.40-66.40] | 1.03 | NONDETERMINISTIC-BYTES |
| suspense-staggered | low | off | 13364 | 2113 | 1493 | 7634 | 63.29 [63.29-63.29] | 1.00 |  |
| suspense-staggered | low | all | 10274 (-23.1%) | 1983 (-6.2%) | 1452 (-2.7%) | 4544 (-40.5%) | 63.10 [63.10-63.10] | 1.00 | NONDETERMINISTIC-BYTES |
| tabs-panels-prop | low | off | 1402 | 635 | 519 | 960 | 0.45 [0.45-0.45] | 1.00 |  |
| tabs-panels-prop | low | all | 1402 (0.0%) | 635 (0.0%) | 519 (0.0%) | 960 (0.0%) | 0.32 [0.32-0.32] | 0.71 | NO-BENEFIT |
| tiny-static | low | off | 1632 | 512 | 391 | 1094 | 0.28 [0.28-0.28] | 1.00 |  |
| tiny-static | low | all | 862 (-47.2%) | 419 (-18.2%) | 313 (-19.9%) | 324 (-70.4%) | 0.21 [0.21-0.21] | 0.75 |  |
| tiny-stubs-many | none | off | 568936 | 35307 | 13461 | 379835 | 19.03 [19.03-19.03] | 1.00 |  |
| tiny-stubs-many | none | all | 568885 (-0.0%) | 35294 (-0.0%) | 13544 (+0.6%) | 379784 (-0.0%) | 24.11 [24.11-24.11] | 1.27 | REGRESSION NO-BENEFIT |
| whitespace-entities-text | high | off | 462723 | 22344 | 11887 | 275412 | 7.31 [7.31-7.31] | 1.00 |  |
| whitespace-entities-text | high | all | 193381 (-58.2%) | 11106 (-50.3%) | 5714 (-51.9%) | 6070 (-97.8%) | 3.37 [3.37-3.37] | 0.46 |  |
| wide-tree | high | off | 983517 | 129410 | 46869 | 724327 | 38.88 [38.88-38.88] | 1.00 |  |
| wide-tree | high | all | 259930 (-73.6%) | 26696 (-79.4%) | 8009 (-82.9%) | 740 (-99.9%) | 7.41 [7.41-7.41] | 0.19 |  |
