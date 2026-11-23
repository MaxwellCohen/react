# Scenario corpus results

size=full, N=1 interleaved renders per cell, builds=`/private/tmp/claude-501/-Users-maxcohen-code-react-ecosystem/d4b14db0-012e-4635-a1be-6203fc5af593/scratchpad/builds`. Bytes are deterministic; times are in-process Flight->Fizz render (median ms [Q1-Q3]) and noisy on a shared machine.
Percentages are vs the flags-off build. REGRESSION: any bytes +0.5% or time ratio >1.05 with non-overlapping IQRs. NO-BENEFIT: gzip change within +-1%.

| scenario | expected | variant | HTML B | gzip B | brotli B | inlined Flight B | median ms [IQR] | time x off | flags |
|---|---|---|---|---|---|---|---|---|---|
| all-client | none | off | 5340 | 999 | 631 | 369 | 0.87 [0.87-0.87] | 1.00 |  |
| all-client | none | all | 5340 (0.0%) | 999 (0.0%) | 631 (0.0%) | 369 (0.0%) | 0.86 [0.86-0.86] | 0.98 | NO-BENEFIT |
| attributes-styles-aria | high | off | 1132171 | 52952 | 30102 | 704097 | 21.12 [21.12-21.12] | 1.00 |  |
| attributes-styles-aria | high | all | 752530 (-33.5%) | 43043 (-18.7%) | 24856 (-17.4%) | 324456 (-53.9%) | 12.18 [12.18-12.18] | 0.58 |  |
| blog-article | high | off | 1003824 | 27033 | 12581 | 562734 | 8.28 [8.28-8.28] | 1.00 |  |
| blog-article | high | all | 535532 (-46.7%) | 22315 (-17.5%) | 10593 (-15.8%) | 94442 (-83.2%) | 10.64 [10.64-10.64] | 1.28 | REGRESSION |
| cart-quantity-steppers | low | off | 128177 | 7116 | 4340 | 72864 | 2.50 [2.50-2.50] | 1.00 |  |
| cart-quantity-steppers | low | all | 95014 (-25.9%) | 5812 (-18.3%) | 3491 (-19.6%) | 39701 (-45.5%) | 2.40 [2.40-2.40] | 0.96 |  |
| client-aschild-slot | low | off | 145719 | 9305 | 4115 | 96048 | 2.81 [2.81-2.81] | 1.00 |  |
| client-aschild-slot | low | all | 99103 (-32.0%) | 8660 (-6.9%) | 3839 (-6.7%) | 49432 (-48.5%) | 2.45 [2.45-2.45] | 0.87 |  |
| client-children-inspect | low | off | 23634 | 2398 | 1546 | 14278 | 0.79 [0.79-0.79] | 1.00 |  |
| client-children-inspect | low | all | 23685 (+0.2%) | 2421 (+1.0%) | 1568 (+1.4%) | 14329 (+0.4%) | 0.75 [0.75-0.75] | 0.95 | REGRESSION NO-BENEFIT |
| client-composition-slot | low | off | 21012 | 3009 | 1486 | 14330 | 0.71 [0.71-0.71] | 1.00 |  |
| client-composition-slot | low | all | 10626 (-49.4%) | 2211 (-26.5%) | 1168 (-21.4%) | 3944 (-72.5%) | 0.49 [0.49-0.49] | 0.69 |  |
| client-only-wrapper | low | off | 1069 | 553 | 450 | 851 | 0.17 [0.17-0.17] | 1.00 |  |
| client-only-wrapper | low | all | 1082 (+1.2%) | 577 (+4.3%) | 468 (+4.0%) | 864 (+1.5%) | 0.18 [0.18-0.18] | 1.04 | REGRESSION |
| client-suspends-in-ssr | high | off | 258524 | 18910 | 8190 | 167783 | 23.01 [23.01-23.01] | 1.00 |  |
| client-suspends-in-ssr | high | all | 104904 (-59.4%) | 10351 (-45.3%) | 4352 (-46.9%) | 14163 (-91.6%) | 20.43 [20.43-20.43] | 0.89 |  |
| comments-thread-recursive | high | off | 426843 | 13781 | 10582 | 280225 | 6.37 [6.37-6.37] | 1.00 |  |
| comments-thread-recursive | high | all | 195079 (-54.3%) | 9846 (-28.6%) | 6812 (-35.6%) | 48461 (-82.7%) | 4.05 [4.05-4.05] | 0.64 |  |
| dangerous-inner-html | high | off | 316613 | 19819 | 9807 | 183731 | 2.25 [2.25-2.25] | 1.00 |  |
| dangerous-inner-html | high | all | 136929 (-56.8%) | 9893 (-50.1%) | 4774 (-51.3%) | 4047 (-97.8%) | 1.17 [1.17-1.17] | 0.52 |  |
| dashboard-client-widgets | low | off | 42057 | 3956 | 2593 | 15902 | 1.05 [1.05-1.05] | 1.00 |  |
| dashboard-client-widgets | low | all | 37675 (-10.4%) | 3587 (-9.3%) | 2333 (-10.0%) | 11520 (-27.6%) | 0.94 [0.94-0.94] | 0.90 |  |
| data-grid-client-cells | none | off | 536709 | 69656 | 34025 | 331181 | 15.03 [15.03-15.03] | 1.00 |  |
| data-grid-client-cells | none | all | 535170 (-0.3%) | 69569 (-0.1%) | 33945 (-0.2%) | 329642 (-0.5%) | 15.37 [15.37-15.37] | 1.02 | NO-BENEFIT |
| data-grid-server-cells | high | off | 2298820 | 227145 | 111910 | 1611179 | 59.13 [59.13-59.13] | 1.00 |  |
| data-grid-server-cells | high | all | 688338 (-70.1%) | 92303 (-59.4%) | 51017 (-54.4%) | 697 (-100.0%) | 20.58 [20.58-20.58] | 0.35 |  |
| deep-tree | high | off | 47205 | 3142 | 1670 | 29543 | 1.19 [1.19-1.19] | 1.00 |  |
| deep-tree | high | all | 36616 (-22.4%) | 2951 (-6.1%) | 1552 (-7.1%) | 18954 (-35.8%) | 1.33 [1.33-1.33] | 1.12 | REGRESSION |
| docs-sidebar-toc | high | off | 697966 | 39534 | 17584 | 456024 | 19.23 [19.23-19.23] | 1.00 |  |
| docs-sidebar-toc | high | all | 251295 (-64.0%) | 16436 (-58.4%) | 6930 (-60.6%) | 9353 (-97.9%) | 4.75 [4.75-4.75] | 0.25 |  |
| form-controls-uncontrolled | high | off | 324437 | 26416 | 9262 | 208313 | 6.36 [6.36-6.36] | 1.00 |  |
| form-controls-uncontrolled | high | all | 292001 (-10.0%) | 25246 (-4.4%) | 9555 (+3.2%) | 175877 (-15.6%) | 5.24 [5.24-5.24] | 0.82 | REGRESSION |
| fragments-arrays-keys | low | off | 2055 | 793 | 646 | 1537 | 0.25 [0.25-0.25] | 1.00 |  |
| fragments-arrays-keys | low | all | 1703 (-17.1%) | 778 (-1.9%) | 662 (+2.5%) | 1185 (-22.9%) | 0.23 [0.23-0.23] | 0.91 | REGRESSION |
| full-refresh-focus | low | off | 1270 | 661 | 528 | 875 | 0.31 [0.31-0.31] | 1.00 |  |
| full-refresh-focus | low | all | 1235 (-2.8%) | 664 (+0.5%) | 535 (+1.3%) | 840 (-4.0%) | 0.27 [0.27-0.27] | 0.88 | REGRESSION NO-BENEFIT |
| head-hoistables | low | off | 66593 | 4841 | 2799 | 40018 | 1.20 [1.20-1.20] | 1.00 |  |
| head-hoistables | low | all | 61230 (-8.1%) | 4834 (-0.1%) | 2865 (+2.4%) | 34655 (-13.4%) | 1.16 [1.16-1.16] | 0.97 | REGRESSION NO-BENEFIT |
| huge-inline-svg | high | off | 1181380 | 113810 | 48553 | 736827 | 37.20 [37.20-37.20] | 1.00 |  |
| huge-inline-svg | high | all | 570919 (-51.7%) | 57094 (-49.8%) | 20917 (-56.9%) | 126366 (-82.8%) | 13.90 [13.90-13.90] | 0.37 |  |
| i18n-text-heavy | high | off | 251241 | 11165 | 5962 | 150804 | 3.92 [3.92-3.92] | 1.00 |  |
| i18n-text-heavy | high | all | 108498 (-56.8%) | 6353 (-43.1%) | 3026 (-49.2%) | 8061 (-94.7%) | 1.80 [1.80-1.80] | 0.46 |  |
| islands-many-tiny | low | off | 428827 | 14703 | 6882 | 232154 | 4.09 [4.09-4.09] | 1.00 |  |
| islands-many-tiny | low | all | 260765 (-39.2%) | 12561 (-14.6%) | 5154 (-25.1%) | 64092 (-72.4%) | 3.59 [3.59-3.59] | 0.88 |  |
| keyed-list-client-reorder | low | off | 1486 | 624 | 510 | 1021 | 0.68 [0.68-0.68] | 1.00 |  |
| keyed-list-client-reorder | low | all | 1486 (0.0%) | 624 (0.0%) | 510 (0.0%) | 1021 (0.0%) | 0.27 [0.27-0.27] | 0.39 | NO-BENEFIT |
| marketing-style-jsonld | high | off | 624283 | 70074 | 23882 | 318656 | 1.94 [1.94-1.94] | 1.00 |  |
| marketing-style-jsonld | high | all | 306377 (-50.9%) | 35569 (-49.2%) | 19368 (-18.9%) | 750 (-99.8%) | 1.52 [1.52-1.52] | 0.78 |  |
| modal-children-toggle | low | off | 1026 | 555 | 449 | 794 | 0.28 [0.28-0.28] | 1.00 |  |
| modal-children-toggle | low | all | 1026 (0.0%) | 555 (0.0%) | 449 (0.0%) | 794 (0.0%) | 0.16 [0.16-0.16] | 0.55 | NO-BENEFIT |
| nested-layouts-context | low | off | 89840 | 5295 | 2665 | 55577 | 1.68 [1.68-1.68] | 1.00 |  |
| nested-layouts-context | low | all | 40125 (-55.3%) | 3129 (-40.9%) | 1617 (-39.3%) | 5862 (-89.5%) | 0.80 [0.80-0.80] | 0.48 |  |
| nested-suspense-waterfall | low | off | 3159 | 1232 | 1004 | 1522 | 96.69 [96.69-96.69] | 1.00 |  |
| nested-suspense-waterfall | low | all | 3010 (-4.7%) | 1244 (+1.0%) | 1016 (+1.2%) | 1373 (-9.8%) | 96.44 [96.44-96.44] | 1.00 | REGRESSION NO-BENEFIT |
| product-detail-reviews | high | off | 391180 | 16502 | 11495 | 236793 | 5.78 [5.78-5.78] | 1.00 |  |
| product-detail-reviews | high | all | 161810 (-58.6%) | 8530 (-48.3%) | 5822 (-49.4%) | 7423 (-96.9%) | 2.62 [2.62-2.62] | 0.45 |  |
| product-listing | high | off | 1133629 | 55794 | 24789 | 747447 | 19.27 [19.27-19.27] | 1.00 |  |
| product-listing | high | all | 689900 (-39.1%) | 54734 (-1.9%) | 22253 (-10.2%) | 303718 (-59.4%) | 13.87 [13.87-13.87] | 0.72 |  |
| realistic-storefront | high | off | 156354 | 12250 | 6500 | 101545 | 2.99 [2.99-2.99] | 1.00 |  |
| realistic-storefront | high | all | 108291 (-30.7%) | 10347 (-15.5%) | 5279 (-18.8%) | 53482 (-47.3%) | 2.38 [2.38-2.38] | 0.79 |  |
| repeated-long-strings | low | off | 1016774 | 11732 | 4420 | 607479 | 6.07 [6.07-6.07] | 1.00 |  |
| repeated-long-strings | low | all | 622223 (-38.8%) | 13194 (+12.5%) | 4838 (+9.5%) | 212928 (-64.9%) | 4.52 [4.52-4.52] | 0.74 | REGRESSION |
| repeated-object-props | low | off | 67490 | 2813 | 1560 | 39920 | 1.53 [1.53-1.53] | 1.00 |  |
| repeated-object-props | low | all | 67434 (-0.1%) | 2814 (+0.0%) | 1604 (+2.8%) | 39864 (-0.1%) | 1.41 [1.41-1.41] | 0.93 | REGRESSION NO-BENEFIT |
| server-action-form | low | off | 1632 | 873 | 681 | 800 | 0.20 [0.20-0.20] | 1.00 |  |
| server-action-form | low | all | 1632 (0.0%) | 873 (0.0%) | 681 (0.0%) | 800 (0.0%) | 0.19 [0.19-0.19] | 0.92 | NO-BENEFIT |
| server-element-via-props | low | off | 1839 | 779 | 637 | 1274 | 0.52 [0.52-0.52] | 1.00 |  |
| server-element-via-props | low | all | 1839 (0.0%) | 779 (0.0%) | 637 (0.0%) | 1274 (0.0%) | 0.22 [0.22-0.22] | 0.43 | NO-BENEFIT |
| server-error-in-suspense | low | off | 1312 | 626 | 512 | 995 | 0.24 [0.24-0.24] | 1.00 |  |
| server-error-in-suspense | low | all | 1420 (+8.2%) | 662 (+5.8%) | 547 (+6.8%) | 1103 (+10.9%) | 0.22 [0.22-0.22] | 0.93 | REGRESSION |
| server-table-client-rows | high | off | 635617 | 42261 | 21740 | 491377 | 14.45 [14.45-14.45] | 1.00 |  |
| server-table-client-rows | high | all | 166937 (-73.7%) | 21262 (-49.7%) | 8852 (-59.3%) | 22697 (-95.4%) | 5.88 [5.88-5.88] | 0.41 |  |
| suspense-fallback-shown-late | low | off | 1290 | 645 | 524 | 955 | 0.27 [0.27-0.27] | 1.00 |  |
| suspense-fallback-shown-late | low | all | 1176 (-8.8%) | 649 (+0.6%) | 536 (+2.3%) | 841 (-11.9%) | 0.27 [0.27-0.27] | 0.99 | REGRESSION NO-BENEFIT |
| suspense-many-boundaries | low | off | 57718 | 5571 | 3155 | 33494 | 64.64 [64.64-64.64] | 1.00 | NONDETERMINISTIC-BYTES |
| suspense-many-boundaries | low | all | 41127 (-28.7%) | 5152 (-7.5%) | 2999 (-4.9%) | 16903 (-49.5%) | 66.69 [66.69-66.69] | 1.03 | NONDETERMINISTIC-BYTES |
| suspense-staggered | low | off | 13364 | 2110 | 1488 | 7634 | 63.19 [63.19-63.19] | 1.00 |  |
| suspense-staggered | low | all | 10143 (-24.1%) | 1979 (-6.2%) | 1437 (-3.4%) | 4413 (-42.2%) | 64.63 [64.63-64.63] | 1.02 |  |
| tabs-panels-prop | low | off | 1402 | 635 | 519 | 960 | 0.50 [0.50-0.50] | 1.00 |  |
| tabs-panels-prop | low | all | 1402 (0.0%) | 635 (0.0%) | 519 (0.0%) | 960 (0.0%) | 0.45 [0.45-0.45] | 0.89 | NO-BENEFIT |
| tiny-static | low | off | 1632 | 512 | 391 | 1094 | 0.46 [0.46-0.46] | 1.00 |  |
| tiny-static | low | all | 862 (-47.2%) | 419 (-18.2%) | 313 (-19.9%) | 324 (-70.4%) | 0.29 [0.29-0.29] | 0.62 |  |
| whitespace-entities-text | high | off | 462723 | 22344 | 11868 | 275412 | 7.26 [7.26-7.26] | 1.00 |  |
| whitespace-entities-text | high | all | 193271 (-58.2%) | 11065 (-50.5%) | 5695 (-52.0%) | 5960 (-97.8%) | 3.25 [3.25-3.25] | 0.45 |  |
| wide-tree | high | off | 983517 | 129410 | 46869 | 724327 | 39.64 [39.64-39.64] | 1.00 |  |
| wide-tree | high | all | 259892 (-73.6%) | 26698 (-79.4%) | 10410 (-77.8%) | 702 (-99.9%) | 5.48 [5.48-5.48] | 0.14 |  |
