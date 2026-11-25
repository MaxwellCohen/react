# Scenario corpus results

size=full, N=1 interleaved renders per cell, builds=`<builds>`. Bytes are deterministic; times are in-process Flight->Fizz render (median ms [Q1-Q3]) and noisy on a shared machine.
Percentages are vs the flags-off build. REGRESSION: any bytes +0.5% or time ratio >1.05 with non-overlapping IQRs. NO-BENEFIT: gzip change within +-1%.

| scenario | expected | variant | HTML B | gzip B | brotli B | inlined Flight B | median ms [IQR] | time x off | flags |
|---|---|---|---|---|---|---|---|---|---|
| all-client | none | off | 5337 | 996 | 641 | 366 | 1.03 [1.03-1.03] | 1.00 |  |
| all-client | none | all | 5337 (0.0%) | 996 (0.0%) | 641 (0.0%) | 366 (0.0%) | 0.91 [0.91-0.91] | 0.88 | NO-BENEFIT |
| attributes-styles-aria | high | off | 1132168 | 52947 | 30197 | 704094 | 18.77 [18.77-18.77] | 1.00 |  |
| attributes-styles-aria | high | all | 806655 (-28.8%) | 43848 (-17.2%) | 25484 (-15.6%) | 378581 (-46.2%) | 19.16 [19.16-19.16] | 1.02 |  |
| blog-article | high | off | 1003821 | 27028 | 12347 | 562731 | 11.24 [11.24-11.24] | 1.00 |  |
| blog-article | high | all | 955405 (-4.8%) | 26163 (-3.2%) | 12844 (+4.0%) | 514315 (-8.6%) | 9.33 [9.33-9.33] | 0.83 | REGRESSION |
| cart-quantity-steppers | low | off | 128174 | 7112 | 4348 | 72861 | 3.62 [3.62-3.62] | 1.00 |  |
| cart-quantity-steppers | low | all | 101443 (-20.9%) | 6086 (-14.4%) | 3730 (-14.2%) | 46130 (-36.7%) | 2.07 [2.07-2.07] | 0.57 |  |
| client-aschild-slot | low | off | 145716 | 9301 | 4111 | 96045 | 3.39 [3.39-3.39] | 1.00 |  |
| client-aschild-slot | low | all | 145716 (0.0%) | 9301 (0.0%) | 4111 (0.0%) | 96045 (0.0%) | 2.83 [2.83-2.83] | 0.83 | NO-BENEFIT |
| client-children-inspect | low | off | 23628 | 2395 | 1566 | 14272 | 0.81 [0.81-0.81] | 1.00 |  |
| client-children-inspect | low | all | 23628 (0.0%) | 2395 (0.0%) | 1566 (0.0%) | 14272 (0.0%) | 0.68 [0.68-0.68] | 0.83 | NO-BENEFIT |
| client-composition-slot | low | off | 21009 | 3006 | 1535 | 14327 | 0.90 [0.90-0.90] | 1.00 |  |
| client-composition-slot | low | all | 21009 (0.0%) | 3006 (0.0%) | 1535 (0.0%) | 14327 (0.0%) | 0.92 [0.92-0.92] | 1.02 | NO-BENEFIT |
| client-only-wrapper | low | off | 1066 | 551 | 448 | 848 | 0.20 [0.20-0.20] | 1.00 |  |
| client-only-wrapper | low | all | 1066 (0.0%) | 551 (0.0%) | 448 (0.0%) | 848 (0.0%) | 0.18 [0.18-0.18] | 0.90 | NO-BENEFIT |
| client-suspends-in-ssr | high | off | 258521 | 18906 | 8135 | 167780 | 24.05 [24.05-24.05] | 1.00 |  |
| client-suspends-in-ssr | high | all | 124681 (-51.8%) | 12611 (-33.3%) | 5410 (-33.5%) | 14202 (-91.5%) | 21.67 [21.67-21.67] | 0.90 |  |
| comments-thread-recursive | high | off | 426840 | 13776 | 10588 | 280222 | 10.81 [10.81-10.81] | 1.00 |  |
| comments-thread-recursive | high | all | 227530 (-46.7%) | 10109 (-26.6%) | 7271 (-31.3%) | 80912 (-71.1%) | 4.86 [4.86-4.86] | 0.45 |  |
| dangerous-inner-html | high | off | 316610 | 19815 | 9863 | 183728 | 2.65 [2.65-2.65] | 1.00 |  |
| dangerous-inner-html | high | all | 136926 (-56.8%) | 9885 (-50.1%) | 4774 (-51.6%) | 4044 (-97.8%) | 1.44 [1.44-1.44] | 0.54 |  |
| dashboard-client-widgets | low | off | 42054 | 3953 | 2634 | 15899 | 1.11 [1.11-1.11] | 1.00 |  |
| dashboard-client-widgets | low | all | 40235 (-4.3%) | 3691 (-6.6%) | 2408 (-8.6%) | 14080 (-11.4%) | 1.02 [1.02-1.02] | 0.92 |  |
| data-grid-client-cells | none | off | 536706 | 69650 | 34086 | 331178 | 18.66 [18.66-18.66] | 1.00 |  |
| data-grid-client-cells | none | all | 535250 (-0.3%) | 69591 (-0.1%) | 34297 (+0.6%) | 329722 (-0.4%) | 18.59 [18.59-18.59] | 1.00 | REGRESSION NO-BENEFIT |
| data-grid-server-cells | high | off | 2298817 | 227139 | 112100 | 1611176 | 51.15 [51.15-51.15] | 1.00 |  |
| data-grid-server-cells | high | all | 688393 (-70.1%) | 92332 (-59.4%) | 50963 (-54.5%) | 752 (-100.0%) | 18.48 [18.48-18.48] | 0.36 |  |
| deep-tree | high | off | 47202 | 3139 | 1634 | 29540 | 1.18 [1.18-1.18] | 1.00 |  |
| deep-tree | high | all | 47253 (+0.1%) | 3140 (+0.0%) | 1596 (-2.3%) | 29591 (+0.2%) | 1.08 [1.08-1.08] | 0.91 | NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| docs-sidebar-toc | high | off | 697963 | 39529 | 17605 | 456021 | 12.42 [12.42-12.42] | 1.00 |  |
| docs-sidebar-toc | high | all | 251342 (-64.0%) | 16445 (-58.4%) | 6988 (-60.3%) | 9400 (-97.9%) | 4.54 [4.54-4.54] | 0.37 |  |
| form-controls-uncontrolled | high | off | 324434 | 26410 | 9477 | 208310 | 6.48 [6.48-6.48] | 1.00 |  |
| form-controls-uncontrolled | high | all | 324485 (+0.0%) | 26415 (+0.0%) | 9395 (-0.9%) | 208361 (+0.0%) | 5.62 [5.62-5.62] | 0.87 | NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| fragments-arrays-keys | low | off | 2052 | 791 | 651 | 1534 | 0.29 [0.29-0.29] | 1.00 |  |
| fragments-arrays-keys | low | all | 2052 (0.0%) | 791 (0.0%) | 651 (0.0%) | 1534 (0.0%) | 0.29 [0.29-0.29] | 1.02 | NO-BENEFIT |
| full-refresh-focus | low | off | 1267 | 659 | 530 | 872 | 0.61 [0.61-0.61] | 1.00 |  |
| full-refresh-focus | low | all | 1267 (0.0%) | 659 (0.0%) | 530 (0.0%) | 872 (0.0%) | 0.30 [0.30-0.30] | 0.49 | NO-BENEFIT |
| head-hoistables | low | off | 66590 | 4838 | 2841 | 40015 | 1.37 [1.37-1.37] | 1.00 |  |
| head-hoistables | low | all | 66539 (-0.1%) | 4844 (+0.1%) | 2809 (-1.1%) | 39964 (-0.1%) | 1.28 [1.28-1.28] | 0.94 | NO-BENEFIT |
| huge-inline-svg | high | off | 1181377 | 113784 | 48676 | 736824 | 28.23 [28.23-28.23] | 1.00 |  |
| huge-inline-svg | high | all | 570952 (-51.7%) | 57129 (-49.8%) | 20727 (-57.4%) | 126399 (-82.8%) | 13.39 [13.39-13.39] | 0.47 |  |
| i18n-text-heavy | high | off | 251241 | 11165 | 5962 | 150804 | 3.96 [3.96-3.96] | 1.00 |  |
| i18n-text-heavy | high | all | 108646 (-56.8%) | 6437 (-42.3%) | 3118 (-47.7%) | 8209 (-94.6%) | 1.91 [1.91-1.91] | 0.48 |  |
| islands-many-tiny | low | off | 428824 | 14698 | 6897 | 232151 | 5.11 [5.11-5.11] | 1.00 |  |
| islands-many-tiny | low | all | 428632 (-0.0%) | 14624 (-0.5%) | 6970 (+1.1%) | 231959 (-0.1%) | 4.50 [4.50-4.50] | 0.88 | REGRESSION NO-BENEFIT |
| keyed-list-client-reorder | low | off | 1483 | 623 | 505 | 1018 | 0.35 [0.35-0.35] | 1.00 |  |
| keyed-list-client-reorder | low | all | 1483 (0.0%) | 623 (0.0%) | 505 (0.0%) | 1018 (0.0%) | 0.29 [0.29-0.29] | 0.84 | NO-BENEFIT |
| marketing-style-jsonld | high | off | 624280 | 70072 | 24019 | 318653 | 2.26 [2.26-2.26] | 1.00 |  |
| marketing-style-jsonld | high | all | 306451 (-50.9%) | 35579 (-49.2%) | 19454 (-19.0%) | 824 (-99.7%) | 1.73 [1.73-1.73] | 0.76 |  |
| modal-children-toggle | low | off | 1023 | 555 | 454 | 791 | 0.24 [0.24-0.24] | 1.00 |  |
| modal-children-toggle | low | all | 1023 (0.0%) | 555 (0.0%) | 454 (0.0%) | 791 (0.0%) | 0.22 [0.22-0.22] | 0.89 | NO-BENEFIT |
| nested-layouts-context | low | off | 89828 | 5293 | 2691 | 55565 | 1.70 [1.70-1.70] | 1.00 |  |
| nested-layouts-context | low | all | 40155 (-55.3%) | 3122 (-41.0%) | 1616 (-39.9%) | 5892 (-89.4%) | 0.90 [0.90-0.90] | 0.53 |  |
| nested-suspense-waterfall | low | off | 3156 | 1231 | 1005 | 1519 | 96.52 [96.52-96.52] | 1.00 |  |
| nested-suspense-waterfall | low | all | 3156 (0.0%) | 1231 (0.0%) | 1005 (0.0%) | 1519 (0.0%) | 100.21 [100.21-100.21] | 1.04 | NO-BENEFIT |
| product-detail-reviews | high | off | 391177 | 16500 | 11512 | 236790 | 5.38 [5.38-5.38] | 1.00 |  |
| product-detail-reviews | high | all | 162165 (-58.5%) | 8669 (-47.5%) | 5929 (-48.5%) | 7778 (-96.7%) | 3.86 [3.86-3.86] | 0.72 |  |
| product-listing | high | off | 1133626 | 55789 | 24769 | 747444 | 21.24 [21.24-21.24] | 1.00 |  |
| product-listing | high | all | 1133320 (-0.0%) | 55756 (-0.1%) | 24634 (-0.5%) | 747138 (-0.0%) | 19.12 [19.12-19.12] | 0.90 | NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| realistic-storefront | high | off | 156345 | 12251 | 6533 | 101536 | 3.26 [3.26-3.26] | 1.00 |  |
| realistic-storefront | high | all | 154089 (-1.4%) | 11395 (-7.0%) | 6221 (-4.8%) | 99280 (-2.2%) | 3.12 [3.12-3.12] | 0.96 |  |
| repeated-long-strings | low | off | 1016771 | 11727 | 4504 | 607476 | 6.00 [6.00-6.00] | 1.00 |  |
| repeated-long-strings | low | all | 1016567 (-0.0%) | 11713 (-0.1%) | 4391 (-2.5%) | 607272 (-0.0%) | 6.31 [6.31-6.31] | 1.05 | REGRESSION NO-BENEFIT |
| repeated-object-props | low | off | 67487 | 2810 | 1590 | 39917 | 1.66 [1.66-1.66] | 1.00 |  |
| repeated-object-props | low | all | 67487 (0.0%) | 2810 (0.0%) | 1590 (0.0%) | 39917 (0.0%) | 1.48 [1.48-1.48] | 0.89 | NO-BENEFIT |
| server-action-form | low | off | 1629 | 871 | 679 | 797 | 0.21 [0.21-0.21] | 1.00 |  |
| server-action-form | low | all | 1629 (0.0%) | 871 (0.0%) | 679 (0.0%) | 797 (0.0%) | 0.17 [0.17-0.17] | 0.80 | NO-BENEFIT |
| server-element-via-props | low | off | 1836 | 778 | 635 | 1271 | 0.22 [0.22-0.22] | 1.00 |  |
| server-element-via-props | low | all | 1836 (0.0%) | 778 (0.0%) | 635 (0.0%) | 1271 (0.0%) | 0.22 [0.22-0.22] | 1.01 | NO-BENEFIT |
| server-error-in-suspense | low | off | 1309 | 624 | 508 | 992 | 0.22 [0.22-0.22] | 1.00 |  |
| server-error-in-suspense | low | all | 1309 (0.0%) | 624 (0.0%) | 508 (0.0%) | 992 (0.0%) | 0.19 [0.19-0.19] | 0.89 | NO-BENEFIT |
| server-table-client-rows | high | off | 635614 | 42256 | 21798 | 491374 | 15.15 [15.15-15.15] | 1.00 |  |
| server-table-client-rows | high | all | 173665 (-72.7%) | 22870 (-45.9%) | 9381 (-57.0%) | 29425 (-94.0%) | 8.15 [8.15-8.15] | 0.54 |  |
| suspense-fallback-shown-late | low | off | 1287 | 643 | 524 | 952 | 0.28 [0.28-0.28] | 1.00 |  |
| suspense-fallback-shown-late | low | all | 1287 (0.0%) | 643 (0.0%) | 524 (0.0%) | 952 (0.0%) | 0.24 [0.24-0.24] | 0.85 | NO-BENEFIT |
| suspense-many-boundaries | low | off | 57562 | 5575 | 3151 | 33338 | 65.56 [65.56-65.56] | 1.00 | NONDETERMINISTIC-BYTES |
| suspense-many-boundaries | low | all | 43639 (-24.2%) | 5471 (-1.9%) | 3155 (+0.1%) | 16940 (-49.2%) | 65.67 [65.67-65.67] | 1.00 | NONDETERMINISTIC-BYTES |
| suspense-staggered | low | off | 13361 | 2109 | 1489 | 7631 | 64.21 [64.21-64.21] | 1.00 |  |
| suspense-staggered | low | all | 10746 (-19.6%) | 2059 (-2.4%) | 1498 (+0.6%) | 4541 (-40.5%) | 67.40 [67.40-67.40] | 1.05 | REGRESSION |
| tabs-panels-prop | low | off | 1399 | 634 | 513 | 957 | 0.36 [0.36-0.36] | 1.00 |  |
| tabs-panels-prop | low | all | 1399 (0.0%) | 634 (0.0%) | 513 (0.0%) | 957 (0.0%) | 0.24 [0.24-0.24] | 0.67 | NO-BENEFIT |
| tiny-static | low | off | 1632 | 512 | 391 | 1094 | 0.26 [0.26-0.26] | 1.00 |  |
| tiny-static | low | all | 862 (-47.2%) | 419 (-18.2%) | 313 (-19.9%) | 324 (-70.4%) | 0.18 [0.18-0.18] | 0.69 |  |
| tiny-stubs-many | none | off | 568933 | 35303 | 13579 | 379832 | 18.61 [18.61-18.61] | 1.00 |  |
| tiny-stubs-many | none | all | 568882 (-0.0%) | 35289 (-0.0%) | 13563 (-0.1%) | 379781 (-0.0%) | 21.77 [21.77-21.77] | 1.17 | REGRESSION NO-BENEFIT |
| whitespace-entities-text | high | off | 462720 | 22335 | 11846 | 275409 | 7.24 [7.24-7.24] | 1.00 |  |
| whitespace-entities-text | high | all | 193888 (-58.1%) | 11301 (-49.4%) | 5845 (-50.7%) | 6577 (-97.6%) | 3.66 [3.66-3.66] | 0.51 |  |
| wide-tree | high | off | 983514 | 129411 | 46862 | 724324 | 34.69 [34.69-34.69] | 1.00 |  |
| wide-tree | high | all | 259927 (-73.6%) | 26689 (-79.4%) | 6567 (-86.0%) | 737 (-99.9%) | 6.27 [6.27-6.27] | 0.18 |  |
