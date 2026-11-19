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
