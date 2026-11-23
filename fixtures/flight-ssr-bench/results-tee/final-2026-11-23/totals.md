
## Totals, original (41 pages)

| build | gzip | raw HTML | inlined Flight | brotli |
|---|---|---|---|---|
| off | 1,023,745 | 14,560,723 | 9,282,481 | 478,282 |
| on | 594,628 (-41.9%) | 7,675,454 (-47.3%) | 2,397,212 (-74.2%) | 293,860 (-38.6%) |

stubs: 18,266
pages larger than off (gzip): deep-tree (+2 B; off 3142), head-hoistables (+5 B; off 4841), repeated-long-strings (+1461 B; off 11732), server-error-in-suspense (+17 B; off 626), suspense-fallback-shown-late (+3 B; off 645)
median page gzip saving: 6.2% (261 B)

| top-5 gzip saving | saved B | share |
|---|---|---|
| data-grid-server-cells | 134,808 | 31.4% |
| wide-tree | 102,714 | 23.9% |
| huge-inline-svg | 56,678 | 13.2% |
| marketing-style-jsonld | 34,495 | 8.0% |
| docs-sidebar-toc | 23,084 | 5.4% |
| top 5 together | 351,779 | 82.0% |

## Totals, all (45 pages)

| build | gzip | raw HTML | inlined Flight | brotli |
|---|---|---|---|---|
| off | 1,089,665 | 15,557,536 | 9,940,425 | 505,594 |
| on | 651,644 (-40.2%) | 8,490,981 (-45.4%) | 2,873,870 (-71.1%) | 317,231 (-37.3%) |

stubs: 19,366
pages larger than off (gzip): deep-tree (+2 B; off 3142), head-hoistables (+5 B; off 4841), repeated-long-strings (+1461 B; off 11732), server-error-in-suspense (+17 B; off 626), suspense-fallback-shown-late (+3 B; off 645)
median page gzip saving: 3.6% (261 B)

| top-5 gzip saving | saved B | share |
|---|---|---|
| data-grid-server-cells | 134,808 | 30.8% |
| wide-tree | 102,714 | 23.4% |
| huge-inline-svg | 56,678 | 12.9% |
| marketing-style-jsonld | 34,495 | 7.9% |
| docs-sidebar-toc | 23,084 | 5.3% |
| top 5 together | 351,779 | 80.3% |
