import {Suspense} from 'react';
import {Document} from './doc';
import Counter from './suspense-staggered.counter.client';

export const id = 'suspense-staggered';
export const title = 'Suspense streaming with staggered boundaries';
export const category = 'streaming';
export const description =
  'size async server components, each in its own Suspense boundary, resolving after 5ms + 3ms * index.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 3, full: 20};

async function Section({index}) {
  await new Promise(r => setTimeout(r, 5 + 3 * index));
  return (
    <section id={'s' + index}>
      <h2>Section {index}</h2>
      <p>Streamed content {index}.</p>
      {index === 0 ? <Counter /> : null}
    </section>
  );
}

export function Root({size}) {
  return (
    <Document title="Streaming">
      <h1>Streaming</h1>
      {Array.from({length: size}, (_, i) => (
        <Suspense key={i} fallback={<p>Loading {i}</p>}>
          <Section index={i} />
        </Suspense>
      ))}
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '#s0 h2', text: 'Section 0'}},
  {click: '#s0 button'},
  {expectText: {selector: '#s0 button', text: 'Streamed clicks: 1'}},
];
