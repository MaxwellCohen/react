import {Suspense} from 'react';
import {Document} from './doc';
import Counter from './suspense-many-boundaries.counter.client';

export const id = 'suspense-many-boundaries';
export const title = 'Many independent Suspense boundaries';
export const category = 'streaming';
export const description =
  'size async server components, each in its own Suspense boundary, delay 5 + (index * 7) % 60 ms, static content inside.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 10, full: 100};

async function Item({index}) {
  await new Promise(r => setTimeout(r, 5 + ((index * 7) % 60)));
  return (
    <article className="b">
      <h2>Boundary {index}</h2>
      <p>Static body {index}.</p>
      {index === 0 ? <Counter /> : null}
    </article>
  );
}

export function Root({size}) {
  return (
    <Document title="Many boundaries">
      {Array.from({length: size}, (_, i) => (
        <Suspense key={i} fallback={<p>Loading {i}</p>}>
          <Item index={i} />
        </Suspense>
      ))}
    </Document>
  );
}

export const interact = [
  {expectCount: {selector: '.b', count: 'size'}},
  {click: 'button.c'},
  {expectText: {selector: 'button.c', text: 'c: 1'}},
];
