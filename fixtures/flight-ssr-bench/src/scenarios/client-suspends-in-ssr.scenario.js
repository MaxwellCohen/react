import {Suspense} from 'react';
import {Document} from './doc';
import Slow from './client-suspends-in-ssr.slow.client';

export const id = 'client-suspends-in-ssr';
export const title = 'Client component suspending during SSR';
export const category = 'streaming';
export const description =
  'A client component suspends on its own promise (a few timeouts) in SSR and hydration, then renders large static server children one level down.';
export const expectedBenefit = 'high';
export const sizes = {smoke: 10, full: 800};

export function Root({size}) {
  return (
    <Document title="Client suspends">
      <h1>Client suspends</h1>
      <Suspense fallback={<p className="fallback">Loading...</p>}>
        <Slow>
          <ul className="rows">
            {Array.from({length: size}, (_, i) => (
              <li key={i}>
                <h3>Row {i}</h3>
                <p>Static server content for row {i}, shipped once as HTML.</p>
              </li>
            ))}
          </ul>
        </Slow>
      </Suspense>
    </Document>
  );
}

export const interact = [
  {expectCount: {selector: '.rows li', count: 'size'}},
  {click: 'button.counter'},
  {expectText: {selector: 'button.counter', text: 'n: 1'}},
  {expectCount: {selector: '.rows li', count: 'size'}},
];
