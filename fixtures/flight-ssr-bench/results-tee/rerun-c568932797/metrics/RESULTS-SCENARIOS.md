# Scenario corpus results

size=full, N=1 interleaved renders per cell, builds=`/private/tmp/claude-501/-Users-maxcohen-code-react-ecosystem/d4b14db0-012e-4635-a1be-6203fc5af593/scratchpad/builds-c56`. Bytes are deterministic; times are in-process Flight->Fizz render (median ms [Q1-Q3]) and noisy on a shared machine.
Percentages are vs the flags-off build. REGRESSION: any bytes +0.5% or time ratio >1.05 with non-overlapping IQRs. NO-BENEFIT: gzip change within +-1%.

| scenario | expected | variant | HTML B | gzip B | brotli B | inlined Flight B | median ms [IQR] | time x off | flags |
|---|---|---|---|---|---|---|---|---|---|
| all-client | none | off | 5277 | 952 | 590 | 306 | 0.86 [0.86-0.86] | 1.00 |  |
| all-client | none | all | 5277 (0.0%) | 952 (0.0%) | 590 (0.0%) | 306 (0.0%) | 0.90 [0.90-0.90] | 1.04 | NO-BENEFIT |
| attributes-styles-aria | high | off | 1132108 | 52870 | 30035 | 704034 | 27.06 [27.06-27.06] | 1.00 |  |
| attributes-styles-aria | high | all | 806481 (-28.8%) | 43769 (-17.2%) | 25480 (-15.2%) | 378407 (-46.3%) | 17.22 [17.22-17.22] | 0.64 |  |
| blog-article | high | off | 1003761 | 26982 | 12309 | 562671 | 11.31 [11.31-11.31] | 1.00 |  |
| blog-article | high | all | 555749 (-44.6%) | 23571 (-12.6%) | 12160 (-1.2%) | 114659 (-79.6%) | 6.63 [6.63-6.63] | 0.59 |  |
| cart-quantity-steppers | low | off | 128114 | 7065 | 4368 | 72801 | 3.69 [3.69-3.69] | 1.00 |  |
| cart-quantity-steppers | low | all | 101280 (-20.9%) | 5996 (-15.1%) | 3700 (-15.3%) | 45967 (-36.9%) | 3.16 [3.16-3.16] | 0.86 |  |
| client-aschild-slot | low | off | 145656 | 9253 | 4119 | 95985 | 3.58 [3.58-3.58] | 1.00 |  |
| client-aschild-slot | low | all | 117999 (-19.0%) | 8915 (-3.7%) | 3883 (-5.7%) | 68328 (-28.8%) | 2.47 [2.47-2.47] | 0.69 |  |
| client-children-inspect | low | off | 23508 | 2349 | 1514 | 14152 | 1.05 [1.05-1.05] | 1.00 |  |
| client-children-inspect | low | all | 23508 (0.0%) | 2349 (0.0%) | 1514 (0.0%) | 14152 (0.0%) | 0.78 [0.78-0.78] | 0.75 | NO-BENEFIT |
| client-composition-slot | low | off | 20949 | 2959 | 1495 | 14267 | 1.10 [1.10-1.10] | 1.00 |  |
| client-composition-slot | low | all | 20949 (0.0%) | 2959 (0.0%) | 1495 (0.0%) | 14267 (0.0%) | 0.78 [0.78-0.78] | 0.71 | NO-BENEFIT |
| client-only-wrapper | low | off | 1006 | 503 | 404 | 788 | 0.22 [0.22-0.22] | 1.00 |  |
| client-only-wrapper | low | all | 1006 (0.0%) | 503 (0.0%) | 404 (0.0%) | 788 (0.0%) | 0.17 [0.17-0.17] | 0.76 | NO-BENEFIT |
| client-suspends-in-ssr | high | off | 258461 | 18858 | 8087 | 167720 | 24.38 [24.38-24.38] | 1.00 |  |
| client-suspends-in-ssr | high | all | 104883 (-59.4%) | 10304 (-45.4%) | 4299 (-46.8%) | 14142 (-91.6%) | 19.88 [19.88-19.88] | 0.82 |  |
| comments-thread-recursive | high | off | 426780 | 13730 | 10519 | 280162 | 8.88 [8.88-8.88] | 1.00 |  |
| comments-thread-recursive | high | all | 195104 (-54.3%) | 9831 (-28.4%) | 6798 (-35.4%) | 48486 (-82.7%) | 4.90 [4.90-4.90] | 0.55 |  |
| dangerous-inner-html | high | off | 316550 | 19763 | 9771 | 183668 | 2.97 [2.97-2.97] | 1.00 |  |
| dangerous-inner-html | high | all | 136866 (-56.8%) | 9840 (-50.2%) | 4734 (-51.6%) | 3984 (-97.8%) | 1.39 [1.39-1.39] | 0.47 |  |
| dashboard-client-widgets | low | off | 41994 | 3907 | 2588 | 15839 | 1.34 [1.34-1.34] | 1.00 |  |
| dashboard-client-widgets | low | all | 40175 (-4.3%) | 3645 (-6.7%) | 2393 (-7.5%) | 14020 (-11.5%) | 1.09 [1.09-1.09] | 0.81 |  |
| data-grid-client-cells | none | off | 536646 | 69595 | 33828 | 331118 | 18.20 [18.20-18.20] | 1.00 |  |
| data-grid-client-cells | none | all | 535190 (-0.3%) | 69540 (-0.1%) | 34093 (+0.8%) | 329662 (-0.4%) | 12.21 [12.21-12.21] | 0.67 | REGRESSION NO-BENEFIT |
| data-grid-server-cells | high | off | 2298757 | 227098 | 111745 | 1611116 | 52.50 [52.50-52.50] | 1.00 |  |
| data-grid-server-cells | high | all | 688333 (-70.1%) | 92276 (-59.4%) | 50970 (-54.4%) | 692 (-100.0%) | 20.90 [20.90-20.90] | 0.40 |  |
| deep-tree | high | off | 47142 | 3091 | 1595 | 29480 | 1.14 [1.14-1.14] | 1.00 |  |
| deep-tree | high | all | 47193 (+0.1%) | 3091 (0.0%) | 1582 (-0.8%) | 29531 (+0.2%) | 1.78 [1.78-1.78] | 1.57 | REGRESSION NO-BENEFIT EXPECTED-HIGH-GOT-NONE |
| docs-sidebar-toc | high | off | 697903 | 39469 | 17565 | 455961 | 18.79 [18.79-18.79] | 1.00 |  |
| docs-sidebar-toc | high | all | 251282 (-64.0%) | 16396 (-58.5%) | 6964 (-60.4%) | 9340 (-98.0%) | 4.85 [4.85-4.85] | 0.26 |  |
| form-controls-uncontrolled | high | off | 324374 | 26357 | 9360 | 208250 | 6.76 [6.76-6.76] | 1.00 |  |
| form-controls-uncontrolled | high | all | 317815 (-2.0%) | 26033 (-1.2%) | 9732 (+4.0%) | 201691 (-3.1%) | 6.26 [6.26-6.26] | 0.93 | REGRESSION |
| fragments-arrays-keys | low | off | 1992 | 741 | 611 | 1474 | 0.39 [0.39-0.39] | 1.00 |  |
| fragments-arrays-keys | low | all | 1992 (0.0%) | 741 (0.0%) | 611 (0.0%) | 1474 (0.0%) | 0.33 [0.33-0.33] | 0.84 | NO-BENEFIT |
| full-refresh-focus | low | off | 1207 | 610 | 484 | 812 | 0.26 [0.26-0.26] | 1.00 |  |
| full-refresh-focus | low | all | 1207 (0.0%) | 610 (0.0%) | 484 (0.0%) | 812 (0.0%) | 0.25 [0.25-0.25] | 0.97 | NO-BENEFIT |
| head-hoistables | low | off | 66530 | 4782 | 2818 | 39955 | 1.31 [1.31-1.31] | 1.00 |  |
| head-hoistables | low | all | 66479 (-0.1%) | 4796 (+0.3%) | 2826 (+0.3%) | 39904 (-0.1%) | 1.27 [1.27-1.27] | 0.97 | NO-BENEFIT |
| huge-inline-svg | high | off | 1181317 | 113766 | 48840 | 736764 | 29.56 [29.56-29.56] | 1.00 |  |
| huge-inline-svg | high | all | 570892 (-51.7%) | 57089 (-49.8%) | 20690 (-57.6%) | 126339 (-82.9%) | 13.87 [13.87-13.87] | 0.47 |  |
| i18n-text-heavy | high | off | 251241 | 11165 | 5962 | 150804 | 4.15 [4.15-4.15] | 1.00 |  |
| i18n-text-heavy | high | all | 108554 (-56.8%) | 6378 (-42.9%) | 3015 (-49.4%) | 8117 (-94.6%) | 1.81 [1.81-1.81] | 0.44 |  |
| islands-many-tiny | low | off | 428764 | 14649 | 6896 | 232091 | 3.95 [3.95-3.95] | 1.00 |  |
| islands-many-tiny | low | all | 260702 (-39.2%) | 12509 (-14.6%) | 5113 (-25.9%) | 64029 (-72.4%) | 3.64 [3.64-3.64] | 0.92 |  |
| keyed-list-client-reorder | low | off | 1423 | 575 | 478 | 958 | 0.19 [0.19-0.19] | 1.00 |  |
| keyed-list-client-reorder | low | all | 1423 (0.0%) | 575 (0.0%) | 478 (0.0%) | 958 (0.0%) | 0.16 [0.16-0.16] | 0.87 | NO-BENEFIT |
| marketing-style-jsonld | high | off | 624220 | 70024 | 24137 | 318593 | 4.81 [4.81-4.81] | 1.00 |  |
| marketing-style-jsonld | high | all | 306391 (-50.9%) | 35535 (-49.3%) | 19222 (-20.4%) | 764 (-99.8%) | 2.19 [2.19-2.19] | 0.46 |  |
| modal-children-toggle | low | off | 963 | 509 | 423 | 731 | 0.22 [0.22-0.22] | 1.00 |  |
| modal-children-toggle | low | all | 963 (0.0%) | 509 (0.0%) | 423 (0.0%) | 731 (0.0%) | 0.19 [0.19-0.19] | 0.86 | NO-BENEFIT |
| nested-layouts-context | low | off | 89588 | 5241 | 2616 | 55325 | 1.88 [1.88-1.88] | 1.00 |  |
| nested-layouts-context | low | all | 39915 (-55.4%) | 3076 (-41.3%) | 1633 (-37.6%) | 5652 (-89.8%) | 1.19 [1.19-1.19] | 0.63 |  |
| nested-suspense-waterfall | low | off | 3096 | 1183 | 988 | 1459 | 92.73 [92.73-92.73] | 1.00 |  |
| nested-suspense-waterfall | low | all | 3096 (0.0%) | 1183 (0.0%) | 988 (0.0%) | 1459 (0.0%) | 93.69 [93.69-93.69] | 1.01 | NO-BENEFIT |
| product-detail-reviews | high | off | 391117 | 16456 | 11472 | 236730 | 5.94 [5.94-5.94] | 1.00 |  |
| product-detail-reviews | high | all | 161936 (-58.6%) | 8534 (-48.1%) | 5704 (-50.3%) | 7549 (-96.8%) | 2.40 [2.40-2.40] | 0.40 |  |
| product-listing | high | off | 1133566 | 55762 | 24796 | 747384 | 22.88 [22.88-22.88] | 1.00 |  |
| product-listing | high | all | 916786 (-19.1%) | 54246 (-2.7%) | 27385 (+10.4%) | 530604 (-29.0%) | 26.47 [26.47-26.47] | 1.16 | REGRESSION |
| realistic-storefront | high | off | 156165 | 12208 | 6411 | 101356 | 3.21 [3.21-3.21] | 1.00 |  |
| realistic-storefront | high | all | 153799 (-1.5%) | 11292 (-7.5%) | 6162 (-3.9%) | 98990 (-2.3%) | 3.98 [3.98-3.98] | 1.24 | REGRESSION |
| repeated-long-strings | low | off | 1016711 | 11674 | 4375 | 607416 | 5.96 [5.96-5.96] | 1.00 |  |
| repeated-long-strings | low | all | 622207 (-38.8%) | 13139 (+12.5%) | 4779 (+9.2%) | 212912 (-64.9%) | 4.93 [4.93-4.93] | 0.83 | REGRESSION |
| repeated-object-props | low | off | 67427 | 2764 | 1541 | 39857 | 1.83 [1.83-1.83] | 1.00 |  |
| repeated-object-props | low | all | 67427 (0.0%) | 2764 (0.0%) | 1541 (0.0%) | 39857 (0.0%) | 1.56 [1.56-1.56] | 0.85 | NO-BENEFIT |
| server-action-form | low | off | 1569 | 821 | 638 | 737 | 0.24 [0.24-0.24] | 1.00 |  |
| server-action-form | low | all | 1569 (0.0%) | 821 (0.0%) | 638 (0.0%) | 737 (0.0%) | 0.22 [0.22-0.22] | 0.90 | NO-BENEFIT |
| server-element-via-props | low | off | 1776 | 729 | 594 | 1211 | 0.28 [0.28-0.28] | 1.00 |  |
| server-element-via-props | low | all | 1776 (0.0%) | 729 (0.0%) | 594 (0.0%) | 1211 (0.0%) | 0.28 [0.28-0.28] | 1.02 | NO-BENEFIT |
| server-error-in-suspense | low | off | 1249 | 578 | 481 | 932 | 0.28 [0.28-0.28] | 1.00 |  |
| server-error-in-suspense | low | all | 1331 (+6.6%) | 595 (+2.9%) | 484 (+0.6%) | 1014 (+8.8%) | 0.25 [0.25-0.25] | 0.87 | REGRESSION |
| server-table-client-rows | high | off | 635554 | 42217 | 21804 | 491314 | 33.12 [33.12-33.12] | 1.00 |  |
| server-table-client-rows | high | all | 173605 (-72.7%) | 22818 (-46.0%) | 9247 (-57.6%) | 29365 (-94.0%) | 8.18 [8.18-8.18] | 0.25 |  |
| suspense-fallback-shown-late | low | off | 1227 | 595 | 475 | 892 | 0.24 [0.24-0.24] | 1.00 |  |
| suspense-fallback-shown-late | low | all | 1180 (-3.8%) | 599 (+0.7%) | 489 (+2.9%) | 845 (-5.3%) | 0.22 [0.22-0.22] | 0.92 | REGRESSION NO-BENEFIT |
| suspense-many-boundaries | low | off | 57961 | 5552 | 3235 | 33737 | 64.50 [64.50-64.50] | 1.00 | NONDETERMINISTIC-BYTES |
| suspense-many-boundaries | low | all | 41461 (-28.5%) | 5103 (-8.1%) | 2935 (-9.3%) | 17237 (-48.9%) | 65.07 [65.07-65.07] | 1.01 | NONDETERMINISTIC-BYTES |
| suspense-staggered | low | off | 13301 | 2061 | 1465 | 7571 | 63.66 [63.66-63.66] | 1.00 | NONDETERMINISTIC-BYTES |
| suspense-staggered | low | all | 10211 (-23.2%) | 1936 (-6.1%) | 1405 (-4.1%) | 4481 (-40.8%) | 64.12 [64.12-64.12] | 1.01 |  |
| tabs-panels-prop | low | off | 1339 | 587 | 474 | 897 | 0.53 [0.53-0.53] | 1.00 |  |
| tabs-panels-prop | low | all | 1339 (0.0%) | 587 (0.0%) | 474 (0.0%) | 897 (0.0%) | 0.34 [0.34-0.34] | 0.64 | NO-BENEFIT |
| tiny-static | low | off | 1632 | 512 | 391 | 1094 | 0.66 [0.66-0.66] | 1.00 |  |
| tiny-static | low | all | 862 (-47.2%) | 419 (-18.2%) | 313 (-19.9%) | 324 (-70.4%) | 0.38 [0.38-0.38] | 0.57 |  |
| tiny-stubs-many | none | off | 568873 | 35258 | 13468 | 379772 | 23.23 [23.23-23.23] | 1.00 |  |
| tiny-stubs-many | none | all | 568822 (-0.0%) | 35244 (-0.0%) | 13538 (+0.5%) | 379721 (-0.0%) | 23.21 [23.21-23.21] | 1.00 | REGRESSION NO-BENEFIT |
| whitespace-entities-text | high | off | 462660 | 22284 | 11803 | 275349 | 7.24 [7.24-7.24] | 1.00 |  |
| whitespace-entities-text | high | all | 193318 (-58.2%) | 11052 (-50.4%) | 5717 (-51.6%) | 6007 (-97.8%) | 3.75 [3.75-3.75] | 0.52 |  |
| wide-tree | high | off | 983454 | 129367 | 46849 | 724264 | 34.92 [34.92-34.92] | 1.00 |  |
| wide-tree | high | all | 259867 (-73.6%) | 26625 (-79.4%) | 7981 (-83.0%) | 677 (-99.9%) | 5.75 [5.75-5.75] | 0.16 |  |
