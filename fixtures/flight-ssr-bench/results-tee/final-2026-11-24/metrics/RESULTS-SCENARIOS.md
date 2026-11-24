# Scenario corpus results

size=full, N=1 interleaved renders per cell, builds=`<builds>`. Bytes are deterministic; times are in-process Flight->Fizz render (median ms [Q1-Q3]) and noisy on a shared machine.
Percentages are vs the flags-off build. REGRESSION: any bytes +0.5% or time ratio >1.05 with non-overlapping IQRs. NO-BENEFIT: gzip change within +-1%.

| scenario | expected | variant | HTML B | gzip B | brotli B | inlined Flight B | median ms [IQR] | time x off | flags |
|---|---|---|---|---|---|---|---|---|---|
| all-client | none | off | 5337 | 996 | 641 | 366 | 1.02 [1.02-1.02] | 1.00 |  |
| all-client | none | all | 5337 (0.0%) | 996 (0.0%) | 641 (0.0%) | 366 (0.0%) | 0.87 [0.87-0.87] | 0.86 | NO-BENEFIT |
| attributes-styles-aria | high | off | 1132168 | 52947 | 30197 | 704094 | 19.13 [19.13-19.13] | 1.00 |  |
| attributes-styles-aria | high | all | 1018563 (-10.0%) | 51592 (-2.6%) | 28818 (-4.6%) | 590489 (-16.1%) | 15.54 [15.54-15.54] | 0.81 |  |
| blog-article | high | off | 1003821 | 27028 | 12347 | 562731 | 13.09 [13.09-13.09] | 1.00 |  |
| blog-article | high | all | 955610 (-4.8%) | 26211 (-3.0%) | 13251 (+7.3%) | 514520 (-8.6%) | 11.22 [11.22-11.22] | 0.86 | REGRESSION |
| cart-quantity-steppers | low | off | 128174 | 7112 | 4348 | 72861 | 3.26 [3.26-3.26] | 1.00 |  |
| cart-quantity-steppers | low | all | 101443 (-20.9%) | 6086 (-14.4%) | 3730 (-14.2%) | 46130 (-36.7%) | 3.22 [3.22-3.22] | 0.99 |  |
| client-aschild-slot | low | off | 145716 | 9301 | 4111 | 96045 | 2.84 [2.84-2.84] | 1.00 |  |
| client-aschild-slot | low | all | 145716 (0.0%) | 9301 (0.0%) | 4111 (0.0%) | 96045 (0.0%) | 3.12 [3.12-3.12] | 1.10 | REGRESSION NO-BENEFIT |
| client-children-inspect | low | off | 23628 | 2395 | 1566 | 14272 | 0.75 [0.75-0.75] | 1.00 |  |
| client-children-inspect | low | all | 23628 (0.0%) | 2395 (0.0%) | 1566 (0.0%) | 14272 (0.0%) | 0.70 [0.70-0.70] | 0.93 | NO-BENEFIT |
| client-composition-slot | low | off | 21009 | 3006 | 1535 | 14327 | 0.89 [0.89-0.89] | 1.00 |  |
| client-composition-slot | low | all | 21009 (0.0%) | 3006 (0.0%) | 1535 (0.0%) | 14327 (0.0%) | 0.74 [0.74-0.74] | 0.83 | NO-BENEFIT |
| client-only-wrapper | low | off | 1066 | 551 | 448 | 848 | 0.28 [0.28-0.28] | 1.00 |  |
| client-only-wrapper | low | all | 1066 (0.0%) | 551 (0.0%) | 448 (0.0%) | 848 (0.0%) | 0.22 [0.22-0.22] | 0.77 | NO-BENEFIT |
| client-suspends-in-ssr | high | off | 258521 | 18906 | 8135 | 167780 | 25.77 [25.77-25.77] | 1.00 |  |
| client-suspends-in-ssr | high | all | 125481 (-51.5%) | 12611 (-33.3%) | 5409 (-33.5%) | 14202 (-91.5%) | 19.91 [19.91-19.91] | 0.77 | NONDETERMINISTIC-BYTES |
| comments-thread-recursive | high | off | 426840 | 13776 | 10588 | 280222 | 6.74 [6.74-6.74] | 1.00 |  |
| comments-thread-recursive | high | all | 227530 (-46.7%) | 10109 (-26.6%) | 7271 (-31.3%) | 80912 (-71.1%) | 5.38 [5.38-5.38] | 0.80 |  |
| dangerous-inner-html | high | off | 316610 | 19815 | 9863 | 183728 | 2.85 [2.85-2.85] | 1.00 |  |
| dangerous-inner-html | high | all | 137006 (-56.7%) | 9925 (-49.9%) | 4822 (-51.1%) | 4124 (-97.8%) | 1.70 [1.70-1.70] | 0.60 |  |
| dashboard-client-widgets | low | off | 42054 | 3953 | 2634 | 15899 | 1.13 [1.13-1.13] | 1.00 |  |
| dashboard-client-widgets | low | all | 40430 (-3.9%) | 3728 (-5.7%) | 2421 (-8.1%) | 14275 (-10.2%) | 1.02 [1.02-1.02] | 0.90 |  |
| data-grid-client-cells | none | off | 536706 | 69650 | 34086 | 331178 | 14.47 [14.47-14.47] | 1.00 |  |
| data-grid-client-cells | none | all | 535250 (-0.3%) | 69591 (-0.1%) | 34297 (+0.6%) | 329722 (-0.4%) | 13.03 [13.03-13.03] | 0.90 | REGRESSION NO-BENEFIT |
| data-grid-server-cells | high | off | 2298817 | 227139 | 112100 | 1611176 | 51.51 [51.51-51.51] | 1.00 |  |
| data-grid-server-cells | high | all | 688393 (-70.1%) | 92332 (-59.4%) | 50963 (-54.5%) | 752 (-100.0%) | 26.72 [26.72-26.72] | 0.52 |  |
| deep-tree | high | off | 47202 | 3139 | 1634 | 29540 | 1.21 [1.21-1.21] | 1.00 |  |
| deep-tree | high | all | 47253 (+0.1%) | 3140 (+0.0%) | 1596 (-2.3%) | 29591 (+0.2%) | 1.05 [1.05-1.05] | 0.87 | NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| docs-sidebar-toc | high | off | 697963 | 39529 | 17605 | 456021 | 16.29 [16.29-16.29] | 1.00 |  |
| docs-sidebar-toc | high | all | 251342 (-64.0%) | 16445 (-58.4%) | 6988 (-60.3%) | 9400 (-97.9%) | 5.83 [5.83-5.83] | 0.36 |  |
| form-controls-uncontrolled | high | off | 324434 | 26410 | 9477 | 208310 | 7.24 [7.24-7.24] | 1.00 |  |
| form-controls-uncontrolled | high | all | 324485 (+0.0%) | 26415 (+0.0%) | 9395 (-0.9%) | 208361 (+0.0%) | 7.00 [7.00-7.00] | 0.97 | NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| fragments-arrays-keys | low | off | 2052 | 791 | 651 | 1534 | 0.39 [0.39-0.39] | 1.00 |  |
| fragments-arrays-keys | low | all | 2052 (0.0%) | 791 (0.0%) | 651 (0.0%) | 1534 (0.0%) | 0.38 [0.38-0.38] | 0.98 | NO-BENEFIT |
| full-refresh-focus | low | off | 1267 | 659 | 530 | 872 | 0.70 [0.70-0.70] | 1.00 |  |
| full-refresh-focus | low | all | 1267 (0.0%) | 659 (0.0%) | 530 (0.0%) | 872 (0.0%) | 0.62 [0.62-0.62] | 0.88 | NO-BENEFIT |
| head-hoistables | low | off | 66590 | 4838 | 2841 | 40015 | 1.36 [1.36-1.36] | 1.00 |  |
| head-hoistables | low | all | 66539 (-0.1%) | 4844 (+0.1%) | 2809 (-1.1%) | 39964 (-0.1%) | 1.34 [1.34-1.34] | 0.99 | NO-BENEFIT |
| huge-inline-svg | high | off | 1181377 | 113784 | 48676 | 736824 | 432.55 [432.55-432.55] | 1.00 |  |
| huge-inline-svg | high | all | 1181122 (-0.0%) | 113756 (-0.0%) | 48291 (-0.8%) | 736569 (-0.0%) | 55.96 [55.96-55.96] | 0.13 | NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| i18n-text-heavy | high | off | 251241 | 11165 | 5962 | 150804 | 14.57 [14.57-14.57] | 1.00 |  |
| i18n-text-heavy | high | all | 251241 (0.0%) | 11165 (0.0%) | 5962 (0.0%) | 150804 (0.0%) | 7.77 [7.77-7.77] | 0.53 | NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| islands-many-tiny | low | off | 428824 | 14698 | 6897 | 232151 | 5.35 [5.35-5.35] | 1.00 |  |
| islands-many-tiny | low | all | 428824 (0.0%) | 14698 (0.0%) | 6897 (0.0%) | 232151 (0.0%) | 9.78 [9.78-9.78] | 1.83 | REGRESSION NO-BENEFIT |
| keyed-list-client-reorder | low | off | 1483 | 623 | 505 | 1018 | 0.31 [0.31-0.31] | 1.00 |  |
| keyed-list-client-reorder | low | all | 1483 (0.0%) | 623 (0.0%) | 505 (0.0%) | 1018 (0.0%) | 0.32 [0.32-0.32] | 1.01 | NO-BENEFIT |
| marketing-style-jsonld | high | off | 624280 | 70072 | 24019 | 318653 | 6.75 [6.75-6.75] | 1.00 |  |
| marketing-style-jsonld | high | all | 306645 (-50.9%) | 35626 (-49.2%) | 19447 (-19.0%) | 1018 (-99.7%) | 2.13 [2.13-2.13] | 0.32 |  |
| modal-children-toggle | low | off | 1023 | 555 | 454 | 791 | 0.65 [0.65-0.65] | 1.00 |  |
| modal-children-toggle | low | all | 1023 (0.0%) | 555 (0.0%) | 454 (0.0%) | 791 (0.0%) | 0.21 [0.21-0.21] | 0.32 | NO-BENEFIT |
| nested-layouts-context | low | off | 89828 | 5293 | 2691 | 55565 | 2.20 [2.20-2.20] | 1.00 |  |
| nested-layouts-context | low | all | 40155 (-55.3%) | 3122 (-41.0%) | 1616 (-39.9%) | 5892 (-89.4%) | 1.18 [1.18-1.18] | 0.53 |  |
| nested-suspense-waterfall | low | off | 3156 | 1231 | 1005 | 1519 | 97.96 [97.96-97.96] | 1.00 |  |
| nested-suspense-waterfall | low | all | 3156 (0.0%) | 1231 (0.0%) | 1005 (0.0%) | 1519 (0.0%) | 101.42 [101.42-101.42] | 1.04 | NO-BENEFIT |
| product-detail-reviews | high | off | 391177 | 16500 | 11512 | 236790 | 5.49 [5.49-5.49] | 1.00 |  |
| product-detail-reviews | high | all | 162165 (-58.5%) | 8669 (-47.5%) | 5929 (-48.5%) | 7778 (-96.7%) | 3.18 [3.18-3.18] | 0.58 |  |
| product-listing | high | off | 1133626 | 55789 | 24769 | 747444 | 24.34 [24.34-24.34] | 1.00 |  |
| product-listing | high | all | 1133320 (-0.0%) | 55756 (-0.1%) | 24634 (-0.5%) | 747138 (-0.0%) | 27.15 [27.15-27.15] | 1.12 | REGRESSION NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| realistic-storefront | high | off | 156345 | 12251 | 6533 | 101536 | 3.19 [3.19-3.19] | 1.00 |  |
| realistic-storefront | high | all | 154636 (-1.1%) | 11636 (-5.0%) | 6218 (-4.8%) | 99827 (-1.7%) | 3.33 [3.33-3.33] | 1.05 |  |
| repeated-long-strings | low | off | 1016771 | 11727 | 4504 | 607476 | 5.68 [5.68-5.68] | 1.00 |  |
| repeated-long-strings | low | all | 1016567 (-0.0%) | 11713 (-0.1%) | 4391 (-2.5%) | 607272 (-0.0%) | 5.91 [5.91-5.91] | 1.04 | NO-BENEFIT |
| repeated-object-props | low | off | 67487 | 2810 | 1590 | 39917 | 1.85 [1.85-1.85] | 1.00 |  |
| repeated-object-props | low | all | 67487 (0.0%) | 2810 (0.0%) | 1590 (0.0%) | 39917 (0.0%) | 1.98 [1.98-1.98] | 1.07 | REGRESSION NO-BENEFIT |
| server-action-form | low | off | 1629 | 871 | 679 | 797 | 0.25 [0.25-0.25] | 1.00 |  |
| server-action-form | low | all | 1629 (0.0%) | 871 (0.0%) | 679 (0.0%) | 797 (0.0%) | 0.55 [0.55-0.55] | 2.20 | REGRESSION NO-BENEFIT |
| server-element-via-props | low | off | 1836 | 778 | 635 | 1271 | 0.40 [0.40-0.40] | 1.00 |  |
| server-element-via-props | low | all | 1836 (0.0%) | 778 (0.0%) | 635 (0.0%) | 1271 (0.0%) | 0.37 [0.37-0.37] | 0.95 | NO-BENEFIT |
| server-error-in-suspense | low | off | 1309 | 624 | 508 | 992 | 0.27 [0.27-0.27] | 1.00 |  |
| server-error-in-suspense | low | all | 1309 (0.0%) | 624 (0.0%) | 508 (0.0%) | 992 (0.0%) | 0.25 [0.25-0.25] | 0.93 | NO-BENEFIT |
| server-table-client-rows | high | off | 635614 | 42256 | 21798 | 491374 | 14.99 [14.99-14.99] | 1.00 |  |
| server-table-client-rows | high | all | 173665 (-72.7%) | 22870 (-45.9%) | 9381 (-57.0%) | 29425 (-94.0%) | 13.19 [13.19-13.19] | 0.88 |  |
| suspense-fallback-shown-late | low | off | 1287 | 643 | 524 | 952 | 0.31 [0.31-0.31] | 1.00 |  |
| suspense-fallback-shown-late | low | all | 1287 (0.0%) | 643 (0.0%) | 524 (0.0%) | 952 (0.0%) | 0.38 [0.38-0.38] | 1.23 | REGRESSION NO-BENEFIT |
| suspense-many-boundaries | low | off | 58021 | 5585 | 3238 | 33797 | 65.30 [65.30-65.30] | 1.00 | NONDETERMINISTIC-BYTES |
| suspense-many-boundaries | low | all | 44047 (-24.1%) | 5483 (-1.8%) | 3200 (-1.2%) | 17348 (-48.7%) | 65.86 [65.86-65.86] | 1.01 | NONDETERMINISTIC-BYTES |
| suspense-staggered | low | off | 13361 | 2109 | 1489 | 7631 | 64.03 [64.03-64.03] | 1.00 |  |
| suspense-staggered | low | all | 10727 (-19.7%) | 2060 (-2.3%) | 1515 (+1.7%) | 4541 (-40.5%) | 65.06 [65.06-65.06] | 1.02 | REGRESSION NONDETERMINISTIC-BYTES |
| tabs-panels-prop | low | off | 1399 | 634 | 513 | 957 | 0.51 [0.51-0.51] | 1.00 |  |
| tabs-panels-prop | low | all | 1399 (0.0%) | 634 (0.0%) | 513 (0.0%) | 957 (0.0%) | 0.60 [0.60-0.60] | 1.19 | REGRESSION NO-BENEFIT |
| tiny-static | low | off | 1632 | 512 | 391 | 1094 | 0.42 [0.42-0.42] | 1.00 |  |
| tiny-static | low | all | 862 (-47.2%) | 419 (-18.2%) | 313 (-19.9%) | 324 (-70.4%) | 0.38 [0.38-0.38] | 0.90 |  |
| tiny-stubs-many | none | off | 568933 | 35303 | 13579 | 379832 | 21.11 [21.11-21.11] | 1.00 |  |
| tiny-stubs-many | none | all | 568882 (-0.0%) | 35289 (-0.0%) | 13563 (-0.1%) | 379781 (-0.0%) | 16.72 [16.72-16.72] | 0.79 | NO-BENEFIT |
| whitespace-entities-text | high | off | 462720 | 22335 | 11846 | 275409 | 7.28 [7.28-7.28] | 1.00 |  |
| whitespace-entities-text | high | all | 193888 (-58.1%) | 11301 (-49.4%) | 5845 (-50.7%) | 6577 (-97.6%) | 5.38 [5.38-5.38] | 0.74 |  |
| wide-tree | high | off | 983514 | 129411 | 46862 | 724324 | 35.92 [35.92-35.92] | 1.00 |  |
| wide-tree | high | all | 259927 (-73.6%) | 26689 (-79.4%) | 6567 (-86.0%) | 737 (-99.9%) | 6.44 [6.44-6.44] | 0.18 |  |
