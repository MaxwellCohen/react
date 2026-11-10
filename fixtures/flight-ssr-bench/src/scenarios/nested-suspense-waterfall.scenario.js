import {Suspense} from 'react';
import {Document} from './doc';
import Counter from './nested-suspense-waterfall.counter.client';

export const id = 'nested-suspense-waterfall';
export const title = 'Three nested async server components with staggered delays';
export const category = 'streaming';
export const description =
  'Nested Suspense waterfall (20/30/40 ms), static content at each level, client counter at the leaf.';
export const expectedBenefit = 'low';

const wait = ms => new Promise(r => setTimeout(r, ms));

async function L3() {
  await wait(40);
  return (
    <div className="l3">
      <p>level 3 static</p>
      <Counter />
    </div>
  );
}
async function L2() {
  await wait(30);
  return (
    <div className="l2">
      <p>level 2 static</p>
      <Suspense fallback={<p>loading 3</p>}>
        <L3 />
      </Suspense>
    </div>
  );
}
async function L1() {
  await wait(20);
  return (
    <div className="l1">
      <p>level 1 static</p>
      <Suspense fallback={<p>loading 2</p>}>
        <L2 />
      </Suspense>
    </div>
  );
}

export function Root() {
  return (
    <Document title="Waterfall">
      <h1>Waterfall</h1>
      <Suspense fallback={<p>loading 1</p>}>
        <L1 />
      </Suspense>
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '.l1 > p', text: 'level 1 static'}},
  {expectText: {selector: '.l2 > p', text: 'level 2 static'}},
  {expectText: {selector: '.l3 > p', text: 'level 3 static'}},
  {click: 'button.leaf'},
  {click: 'button.leaf'},
  {expectText: {selector: 'button.leaf', text: 'leaf: 2'}},
];
