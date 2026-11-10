import {Suspense} from 'react';
import {Document} from './doc';
import Late from './suspense-fallback-shown-late.late.client';

export const id = 'suspense-fallback-shown-late';
export const title = 'Suspense fallback shown only after hydration';
export const category = 'streaming';
export const description =
  'A client component suspends on user action (use() of a promise created on click, outside a transition) inside a server-rendered <Suspense fallback={static markup}>.';
export const expectedBenefit = 'low';

export function Root() {
  return (
    <Document title="Late suspense">
      <h1>Late</h1>
      <Suspense fallback={<p className="fb">server fallback</p>}>
        <Late />
        <p className="sib">static sibling</p>
      </Suspense>
      <p>after</p>
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '.idle', text: 'idle'}},
  {click: 'button.go'},
  {expectText: {selector: '.done', text: 'loaded'}},
  {expectText: {selector: '.sib', text: 'static sibling'}},
];

// Elided static content is mounted by a client render (review finding 1/2).
export const knownFailure = {variants: ['all'], error: 'Static content that the server left out of this payload is needed on the client. This happens when a boundary is client rendered after a hydration mismatch. Refetch the page to recover.'};
