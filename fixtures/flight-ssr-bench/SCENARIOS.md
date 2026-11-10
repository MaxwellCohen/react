# Scenario corpus: authoring contract

A scenario is one SERVER-component page. The harness renders it with every React build variant
(`off`, `elision`, `elision-dedupe`, `all`), hydrates it in real Chromium, and compares it with the flags-off result.
Feature under test: HTML-first Flight, see [HTML-FIRST.md](./HTML-FIRST.md). Do not edit anything outside `src/scenarios/`.

## Validate one scenario (the only command you need)

```sh
SCENARIO_BUILDS=<builds dir> yarn scenarios:check --only <your-id> --size smoke
```

`<builds dir>` contains `off/ elision/ elision-dedupe/ all/` (each a `build/oss-experimental`). Exit 0 and `PASS <id>` = done.
Whole matrix: `yarn scenarios:check --size smoke` and `yarn scenarios:metrics --size smoke` (writes `results/`, git-ignored).
Flags: `--only a,b`, `--size smoke|full`, `--builds <dir>`, `--variants off,all` (off is always included), `--n <renders>` (metrics).

## Files (flat, all in `src/scenarios/`)

- `<id>.scenario.js`: the server module (never `'use client'`). `<id>` is kebab-case and equals the export `id`.
- `<id>.<name>.client.js`: client components. Must start with `'use client'`, default-export the component.
- `doc.js`: `Document({title, head, children})`, the `<html><head><body>` shell. Use it (or render your own `<html>`).

## Template

```js
import {Document} from './doc';
import Counter from './my-page.counter.client'; // optional

export const id = 'my-page'; // kebab-case, = file name prefix
export const title = 'Short title';
export const category = 'static'; // free text: static | table | streaming | composition | client | ...
export const description = 'What it contains and why it matters.';
export const expectedBenefit = 'high'; // 'high' | 'low' | 'none': your prediction of the byte savings
export const sizes = {smoke: 10, full: 1000}; // optional (default {smoke: 5, full: 50}); any JSON value

export function Root({size}) { // SERVER component; size = sizes[--size]
  return (
    <Document title="My page">
      <h1>Hello</h1>
      <Counter />
    </Document>
  );
}

// Optional: what must still work after hydration (plain data, run by Chromium).
export const interact = [
  {click: 'button.counter'},                                      // optional nth: 0
  {fill: 'input#q', value: 'abc'},                                // optional nth
  {expectText: {selector: 'button.counter', text: 'n: 1'}},       // exact textContent, optional nth
  {expectCount: {selector: 'li', count: 'size'}},                 // number, or 'size' = the size value
];
```

Client component: `'use client'; import {useState} from 'react'; export default function X() {...}` in
`my-page.counter.client.js`; import it from the scenario like any module. It needs no registration.

## Rules

1. Root is a server component taking `{size}` and renders the whole document (`<html>`); the client hydrates `document`.
2. Deterministic output: no `Date.now`, `new Date()`, `Math.random`, `performance.now`, `crypto`. Use seeded data
   (`../components/data` `generateProducts(n)`, `../blobs` `makeCss/makeJsonLd`) or pure index arithmetic. The same size must give the same bytes.
3. No network or IO (`fetch`, `http`, `fs`, ...). Async server components may `await` a `setTimeout` (fixed delay) to stagger Suspense.
4. No new dependencies: only `react` and relative imports. No CSS/asset imports; inline CSS via `<style dangerouslySetInnerHTML>`.
5. Smoke size must render in well under a second; full size is what `scenarios:metrics --size full` measures.
6. `interact` must be size-independent except via `'size'`, and every step must hold on all four variants (it also runs after a full-Flight navigation).
7. Cover one idea per scenario; if it genuinely breaks flags-on, keep it (see knownFailure), do not weaken it.
8. Normalization used when comparing DOMs: scripts (except JSON data blocks) and comments dropped, text nodes merged, React's
   `<template id="_R_...">` marker dropped. Everything else must be identical to the flags-off DOM.

## What the check asserts (per scenario x variant)

(a) hydrated and post-interaction DOM equal the flags-off DOM; (b) no console error/warning (browser and server render), no recoverable
hydration error, no page error; (c) `interact` passes on the adopted DOM and again after navigation; (d) a client navigation that swaps in the full,
non-elided Flight payload yields the same DOM as the hydrated page.

## knownFailure (only for real React bugs)

```js
export const knownFailure = {variants: ['all'], error: 'verbatim first error message'};
```
The check then reports an expected failure, and fails if that variant starts passing (remove the marker) or if other variants fail.

## Common failure messages

| message | meaning |
|---|---|
| `Scenario contract violations: ... forbidden non-deterministic API` | rule 2/3: remove `Date.now`/`Math.random`/`fetch` |
| `import of "x" is not allowed` | rule 4: only `react` and relative imports |
| `files with 'use client' must be named *.client.js` / `name must start with "<scenario-id>."` | client file naming |
| `export id must equal the file name prefix` | `id` differs from `<id>.scenario.js` |
| `(dom-vs-off) ... DOM differs from flags-off DOM: first difference at char N` | flags-on DOM is not the flags-off DOM: likely a React bug (or non-deterministic output) |
| `(navigation) DOM after full-Flight navigation differs from hydrated DOM` | refetched content differs from what was adopted |
| `(hydration) recoverable error: ...` | hydration mismatch fell back to client render |
| `(console) pageerror: Static content that the server left out of this payload is needed on the client` | an elided region was mounted by client rendering (e.g. toggled children) |
| `interact[i] ... Timeout 5000ms exceeded (matches=N text=...)` | selector/text never matched; fix the spec or the page |
| `UNEXPECTED PASS: remove knownFailure` | the bug is fixed in that build |
| `Build ... still contains unstable_pruneForBrowser` | `--builds` points at a pre-6ed2e62d21 build |
