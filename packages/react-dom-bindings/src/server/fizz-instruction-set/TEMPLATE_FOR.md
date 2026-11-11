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

## Platform gaps and how the runtime closes them

Everything the platform does not provide is implemented in `ReactDOMFizzInstructionSetShared.js` (inline and external share it). Each entry: what the platform does, how it was measured, the JS mitigation, the test that covers it (`fixtures/fizz-dpu` unless noted), and what JS cannot fix. Measured in Chrome 157, Firefox 157 and WebKit 27.2 (Playwright build).

### G1. No "this template is complete" signal
- **Platform:** `MutationObserver` fires while the parser is still inside `<template for>`. Firefox and WebKit reported `content=1`, no sibling, for a template that ends with two children.
- **Mitigation:** the server writes one empty comment after each flushed group (`declarativeGroupEnd` in `writeDeclarativePatchScript`). `drainDeclarativePatches` only queues a template once it has a next sibling or `document.readyState !== 'loading'`, and drains again on `DOMContentLoaded` and `load`. It never applies on a timer.
- **Tests:** every scenario at 1/3/17/64/500-byte chunks; `strip=1` removes the terminator (a proxy that drops comments) and the page still completes.
- **Residual:** inferred, not reported. Without the terminator the last group waits for `DOMContentLoaded`.

### G2. No hook before or after a native patch
- **Platform:** Chrome applies the patch in the parser, immediately and incrementally (content appears while the template is still streaming) and removes the `<?start>`/`<?end>` markers. Nothing is observable except DOM mutations.
- **Mitigation:** `disarmDeclarativeBoundaries` turns every `<?start>` PI into a comment with the same text so the browser has nothing to patch; the observer disarms markers that stream in after the runtime loaded. A runtime that loads after the browser already patched finds those boundaries (`drainNativelyAppliedPatches`: anchor followed by `<!--$?-->`, marker gone) at init and whenever a marker PI is removed, and post-processes them.
- **Tests:** external runtime (async) at every chunk size, which races markers against the runtime in all three browsers; jest `ReactDOMFizzDeclarativePatchRuntime-test.js`.
- **Residual:** a patch the browser applied before any runtime existed cannot be batched or animated. With no script at all, Chrome patches unthrottled.

### G3. Template content is parsed in the HTML namespace
- **Platform:** a patch inside `<svg>`/`<math>` produces `circle(xhtml)`, and `<image>` becomes `<img>` (Chrome probe).
- **Mitigation:** `patchBoundary` re-parses each patched node with `outerHTML = outerHTML` in the parent namespace (skipping `foreignObject`, `desc`, `title`) and `restoreSvgImages` turns `<img>` back into `<image>`. It also runs after a native apply, and is skipped for nodes React already owns.
- **Tests:** `svg` scenario asserts the circle is in the SVG namespace; jest runtime test for `<image>`.
- **Residual:** re-parsing recreates the nodes (a node that already started loading or upgraded is replaced).

### G4. No view-transition integration
- **Platform:** a patch cannot opt into `document.startViewTransition`.
- **Mitigation:** when the request renders `<ViewTransition>`, the upgrade script swaps `$RW` for `revealCompletedBoundariesWithViewTransitions` (the `$RV` machinery) and applies each batch inside one transition. The upgrade is written before the group's first template: the inline runtime applies a patch as soon as it is parsed, so an upgrade after the group arrives too late. The inline base script is wrapped in an IIFE so its minified top-level helpers cannot be overwritten by the upgrade script.
- **Tests:** `vt` scenario asserts `startViewTransition` was called (the first version of this scenario passed vacuously because `React.ViewTransition` was misspelled; it now fails when the export is missing).
- **Residual:** a natively applied patch cannot animate.

### G5. Native patching cannot be turned off per range
- **Platform:** Chrome patches any `<?start>` range it finds.
- **Mitigation:** same as G2 (disarm).

### G6. Late styles have no ordering semantics
- **Platform:** a `<style>` or `<link rel=stylesheet>` inside a patch is just content.
- **Mitigation:** `hoistPatchStyles` moves `<style data-precedence>` into `<head>` after the last resource of the same precedence (or the last resource). A stylesheet `<link>` is written render-blocking in front of the patch (`writeStartDeclarativePatch`) with all of its props.
- **Tests:** `style` scenario asserts the style is in `<head>` and not in `<body>`; jest.
- **Residual:** the render-blocking `<link>` gate was verified only in Chrome (parser stalls at a body stylesheet).

### G7. No pending/queued/complete state on a range
- **Platform:** none; React needs it for hydration and for not client rendering a waiting boundary.
- **Mitigation:** the `<!--$?-->` / `<!--$~-->` / `<!--$-->` comment contract: queued while waiting for the throttle, completed after apply, then `_reactRetry`. A natively applied patch is completed the same way; a boundary whose markup is still being parsed is left alone.
- **Tests:** jest hydration tests (`ReactDOMFizzDeclarativePatching-test.js`).
- **Residual:** hydration in a real browser is not in the fuzz.

### G8. Range names are global and predictable
- **Mitigation:** `identifierPrefix` is part of the id (`pB:0`); every runtime path matches `/B:[0-9a-f]+$/`.
- **Tests:** `prefix` scenario.
- **Residual:** same exposure as `$RC` ids.

### G9. No Firefox or Safari support
- **Platform:** `<?start>` parses as a comment and the template stays in place (probe).
- **Mitigation:** the runtime is a full polyfill; no browser-specific code.
- **Tests:** the whole matrix in Firefox 157 and WebKit 27.2.
- **Residual:** script is required on those engines. Real Safari.app has not been tested.

### G10. No script-free batching or throttling
- **Platform:** every patch is immediate.
- **Mitigation:** external runtime: queue, then flush after the `$RC` throttle (300 ms since the last reveal, first paint for the first). Inline runtime: apply as soon as the patches arrive, so patches that land in the same tick are one batch. Measured reveal bursts for 100 boundaries are in the table below.
- **Residual:** without script there is no batching.

### G11. Frames are throttled (found by the WebKit fuzz)
- **Platform:** `requestAnimationFrame` does not fire promptly in iframes, background tabs and some headless browsers (WebKit).
- **Mitigation:** the first flush races a frame against a 250 ms timer (`FIRST_PAINT_FALLBACK_MS`); later flushes already use timers.
- **Tests:** the iframe `/fuzz` page in WebKit.
- **Residual:** first reveal can be 250 ms late in a throttled frame.

### Not closable from JS
Native no-script patching is lost whenever the runtime runs (it must own every patch); there is no platform event for completeness; and real Safari.app and mobile engines are unverified.

## Verification (2026-11-11)

`node fixtures/fizz-dpu/run-fuzz.js <port> chrome|firefox|webkit`: 7 scenarios (basic, nested, 100 boundaries, svg, late style, view transition, `identifierPrefix`) x 6 chunk sizes x inline/external runtime, plus 6 stripped-terminator pages, each as a top-level page. Pass means no unapplied template, no stuck `$~`, all content present, SVG nodes in the SVG namespace, the view-transition page called `startViewTransition`, the late style is in `<head>`.

| Browser | fizz/dpu-internal | fizz/dpu-external |
|---|---|---|
| Chrome 157 | 88/88 | 88/88 |
| Firefox 157 | 88/88 | 88/88 |
| WebKit 27.2 (Playwright build) | 88/88 | 88/88 |

The old iframe `/fuzz` page also passes 70/70 in WebKit (it failed 68/70 before the frame-throttle fallback, G11).

Reveal bursts for 100 boundaries (gaps of more than 40 ms between reveals; one run each, so noisy):

| Branch / runtime | Chrome | Firefox | WebKit |
|---|---|---|---|
| internal, inline (immediate) | 1 | 5 | 4 |
| internal, external runtime (throttled) | 2 | 2 | 1 |
| external, inline (throttled) | 2 | 2 | 2 |
| external, external runtime (throttled) | 3 | 2 | 1 |

Not covered: real Safari.app, mobile browsers, hydration in a browser (jest only).

## Known limits

- Predictable boundary names (`B:0`, `B:1`, …), same as `$RC` ids.
- Completeness is inferred from the terminator, not reported by the platform.
- Native Chrome patching is unthrottled and applies incrementally; React cannot hook it.
