import {Suspense} from 'react';
import {Document} from './doc';
import Boom from './server-error-in-suspense.boom.client';

export const id = 'server-error-in-suspense';
export const title = 'Client component throws only during SSR inside Suspense';
export const category = 'client';
export const description =
  'A client component throws only when typeof window is undefined, inside <Suspense> next to static server siblings; React recovers by client-rendering that boundary.';
export const expectedBenefit = 'low';
export const allowRecoverableErrors = true;

export function Root() {
  return (
    <Document title="SSR error">
      <p className="s1">static before</p>
      <Suspense fallback={<p className="fb">fallback</p>}>
        <Boom />
        <p className="inside">static inside</p>
      </Suspense>
      <p className="s2">static after</p>
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '.boom', text: 'client rendered'}},
  {expectText: {selector: '.s1', text: 'static before'}},
  {expectText: {selector: '.s2', text: 'static after'}},
];
