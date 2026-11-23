
## Totals, original (41 pages)

| build | gzip | raw HTML | inlined Flight | brotli |
|---|---|---|---|---|
| off | 1,021,753 | 14,558,410 | 9,280,168 | 477,229 |
| on | 592,662 (-42.0%) | 7,672,988 (-47.3%) | 2,394,746 (-74.2%) | 292,426 (-38.7%) |

stubs: 18,266
pages larger than off (gzip): head-hoistables (+14 B; off 4782), repeated-long-strings (+1465 B; off 11674), server-error-in-suspense (+17 B; off 578), suspense-fallback-shown-late (+4 B; off 595)
median page gzip saving: 6.1% (262 B)

| top-5 gzip saving | saved B | share |
|---|---|---|
| data-grid-server-cells | 134,822 | 31.4% |
| wide-tree | 102,742 | 23.9% |
| huge-inline-svg | 56,677 | 13.2% |
| marketing-style-jsonld | 34,489 | 8.0% |
| docs-sidebar-toc | 23,073 | 5.4% |
| top 5 together | 351,803 | 82.0% |

## Totals, all (45 pages)

| build | gzip | raw HTML | inlined Flight | brotli |
|---|---|---|---|---|
| off | 1,087,471 | 15,554,908 | 9,937,797 | 504,417 |
| on | 649,474 (-40.3%) | 8,488,200 (-45.4%) | 2,871,089 (-71.1%) | 315,660 (-37.4%) |

stubs: 19,366
pages larger than off (gzip): head-hoistables (+14 B; off 4782), repeated-long-strings (+1465 B; off 11674), server-error-in-suspense (+17 B; off 578), suspense-fallback-shown-late (+4 B; off 595)
median page gzip saving: 3.7% (262 B)

| top-5 gzip saving | saved B | share |
|---|---|---|
| data-grid-server-cells | 134,822 | 30.8% |
| wide-tree | 102,742 | 23.5% |
| huge-inline-svg | 56,677 | 12.9% |
| marketing-style-jsonld | 34,489 | 7.9% |
| docs-sidebar-toc | 23,073 | 5.3% |
| top 5 together | 351,803 | 80.3% |
