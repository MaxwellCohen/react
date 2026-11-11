# Out-of-order streaming with `<template for>`

Status: experimental. `enableFizzDeclarativePatching` is off in every build; a request opts in with
`unstable_declarativePatching: true` on `renderToPipeableStream` / `renderToReadableStream` / `prerender` / `resume`.

## Wire format

```html
<!--B:0--><!--$?--><?start name="B:0">…fallback…<?end><!--/$-->   <!-- shell -->
<template for="B:0">…content…</template><!---->                  <!-- later flush -->
```

- `<?start name>` / `<?end>` mark the range a patch replaces. `<!--B:n-->` is the anchor React and the runtime find the boundary by.
- Every completed boundary of a flush is a `<template for>`. There is no `$RC` / `$RB` / `$RV` and no `$RP("B:0",…)` call per group.
- One empty comment follows the last template of a flushed group. It is the "this group is closed" signal (see *Completeness*).
- The server never holds a flush back; boundaries go out with the next normal flush.

## Browsers

| | `<?start>` | `<template for>` | What patches |
|---|---|---|---|
| Chrome (native support) | processing instruction | applied by the parser, incrementally | browser, then the runtime post-processes |
| Firefox, Safari | parsed as a comment | left in place | runtime only |

The runtime is therefore always required for: batching, SVG/MathML, view transitions, late styles, boundary state for hydration, and every browser without native support. Without script, Chrome still patches natively.

## The runtime (`$RP`, shared by inline and external)

`ReactDOMFizzInstructionSetShared.js`: `observeDeclarativePatches()`.

1. **Disarm.** Turn every `<?start>` PI into a comment with the same text so the browser does not patch behind the runtime's back (Chrome). Markers that stream in later are disarmed by the observer.
2. **Observe.** A `MutationObserver` on `document` queues every `template[for]` it has not seen. It also drains on `DOMContentLoaded` and `load`.
3. **Natively applied patches.** If the runtime loaded after the browser already applied a patch (external runtime, async), the anchor is still followed by `<!--$?-->` but the marker is gone. Those boundaries are found at init and whenever the browser removes a marker PI, then post-processed like a template.
4. **Apply** (parents before children, per queued batch): replace the range between the markers with the template content, then
   - mark the boundary `<!--$~-->` while it waits (React does not client render it),
   - re-parse the patched nodes with `outerHTML = outerHTML` inside SVG/MathML, turning `<img>` made from `<image>` back into SVG `<image>`,
   - move `<style data-precedence>` into `<head>` after the last resource of that precedence,
   - set `<!--$-->` and call `_reactRetry`, like `$RC`.
5. **View transitions.** When the request renders `<ViewTransition>`, the first patch script upgrades `$RW` with `revealCompletedBoundariesWithViewTransitions` (the `$RV` machinery).
6. Skips DOM React already owns (`__reactFiber$`), drops patches of boundaries that are gone, and ignores a boundary whose markers are still being parsed.

### Completeness

`MutationObserver` fires while the parser is still inside `<template for>`: Firefox and Safari were measured reporting `content=1`, no sibling, for a template that ends with two children. The runtime therefore treats a template as complete only when something follows it (the group terminator) or `document.readyState !== 'loading'`. Never apply on a timer: a stalled stream and a slow one look the same.

## Modes

| | Inline runtime | External runtime (`unstable_externalRuntimeSrc`) |
|---|---|---|
| Script | `$RP` defined once in the first script, no per-group script | no inline script at all |
| Throttle | 300 ms since the last reveal, like `$RC` | 300 ms since the last reveal, like `$RC` |
| CSP | one nonced script | none (script-src allows the bundle) |

## Prerender, resume, hydration

The opt-in is stored on `ResumableState`, so boundaries postponed by a prerender resume as `<template for>`. `hydrateRoot` reads the DOM as it is: a patched boundary hydrates as completed, a pending one waits for its patch.

## Testing

- Jest: `ReactDOMFizzDeclarative{Patching,Batching,Resume,PatchRuntime}-test.js`.
- Browsers: `fixtures/fizz-dpu` (README there) streams every scenario in 0/1/3/17/64/500-byte chunks with both runtimes. `node fixtures/fizz-dpu/run-fuzz.js <port> chrome|firefox|webkit`.

## Known limits

- Predictable boundary names (`B:0`, `B:1`, …), same as `$RC` ids.
- Completeness is inferred from the terminator, not reported by the platform.
- Native Chrome patching is unthrottled and applies incrementally; React cannot hook it.
