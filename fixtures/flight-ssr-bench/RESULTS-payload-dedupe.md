# Variant (a) payload analysis and dedupe (`enableFlightPayloadDedupe`)

`node analyze-flight.js` (renders `TableServer`, 1000 rows, prod build) parses the Flight rows and attributes bytes. Raw payload is 1,422,498 B; the bench's "inlined Flight" is 1,650,803 B because inlining it as a JS string literal (`JSON.stringify` in `<script>`) escapes every `"` (+228,305 B, 13.8%).

## Before (raw Flight bytes)

| What | Bytes | Share |
| --- | ---: | ---: |
| string values | 831,824 | 58.5% |
| object property names (keys) | 462,360 | 32.5% |
| object braces/commas | 59,065 | 4.2% |
| numbers | 26,403 | 1.9% |
| client-ref element tuples (`["$","$L2",key,...]`) | 18,051 | 1.3% |
| array brackets/commas | 13,030 | 0.9% |
| `$id` / `$L` references | 6,726 | 0.5% |
| row ids, module rows `I[...]`, host elements | ~5,000 | 0.3% |

- 88.8% of the payload is the `product` prop of the 1000 `TableRow` client refs (reviews 36.6%, supplier 13.3%, description 11.2%, specs 8.2%). Only 11 host elements exist, so host elision has nothing to remove.
- Repeated string values beyond the first occurrence: 628,769 B. Of that, 113,886 B is one path reference (`$0:props:children:...:columns`, 114 chars) repeated in 999 rows, and ~277 KB is five review texts repeated 600x each.
- Repeated object key lists (same 1000 product shapes): ~503 KB beyond the first.
- Only 15.4% of the product bytes are for fields `TableRow` reads (`id,name,sku,category,price,stock,status,rating,reviewCount`); 85% is data the component never renders (description, reviews, supplier, specs, tags...).

## Change (server-only, no client changes, behind `enableFlightPayloadDedupe`)

1. A reference to an object inside another row whose path is >= 24 chars is replaced by an outlined row on the second use (`$N`), unless the object is an ancestor still being serialized (keeps cycles pointing at the original).
2. Strings of 40..1023 chars that repeat are written once into their own row and referenced (`$N`); the map is capped at 256 KB of strings.

## After (bench-table.js, same machine, single run)

| Variant (a) | Before | After |
| --- | ---: | ---: |
| raw Flight bytes | 1,422,498 | 1,050,187 (-26.2%) |
| inlined Flight bytes | 1,650,803 | 1,241,253 (-24.8%) |
| inlined Flight gzip | 109,090 | 99,132 (-9.1%) |
| HTML bytes | 2,500,026 | 2,090,476 (-16.4%) |
| HTML gzip | 149,681 | 140,093 (-6.4%) |
| req/s c=1 / c=10 | 20.4 / 18.5 | 24.4 / 27.9 (noisy: b/c vary 2x between runs) |

Remaining (raw): property names 44%, string values 42%. The next real step would be interning property names / object shapes (new row type + client decode); gzip already removes most of that cost on the wire, so it mainly helps uncompressed size and parse time. The rest is the data itself: shrinking it further means passing fewer fields to the client component.
