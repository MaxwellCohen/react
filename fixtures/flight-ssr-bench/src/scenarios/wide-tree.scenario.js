import {Document} from './doc';
import Counter from './wide-tree.counter.client';

export const id = 'wide-tree';
export const title = 'Wide flat list';
export const category = 'static';
export const description =
  'A single <ul> with `size` plain-text siblings, followed by one client counter.';
export const expectedBenefit = 'high';
export const sizes = {smoke: 50, full: 10000};

export function Root({size}) {
  return (
    <Document title="Wide tree">
      <main>
        <h1>Wide tree</h1>
        <ul className="wide">
          {Array.from({length: size}, (_, i) => (
            <li key={i}>Item {i}</li>
          ))}
        </ul>
        <Counter label="wide" />
      </main>
    </Document>
  );
}

export const interact = [
  {click: 'button.counter'},
  {expectText: {selector: 'button.counter', text: 'wide: 1'}},
  {expectCount: {selector: 'ul.wide > li', count: 'size'}},
];
