import {Document} from './doc';
import ClientButton from './tiny-stubs-many.button.client';

export const id = 'tiny-stubs-many';
export const title = 'Many Client Components with two tiny static siblings';
export const category = 'composition';
export const description =
  'size list items, each <li><ClientButton/><span>label i</span><em>x</em></li>: a Client Component plus two tiny static host siblings. Worst case for HTML-first stubs (each saves a few bytes, costs a component in the browser).';
export const expectedBenefit = 'none';
export const sizes = {smoke: 20, full: 2000};

export function Root({size}) {
  const items = [];
  for (let i = 0; i < size; i++) items.push(i);
  return (
    <Document title="Tiny stubs">
      <ul id="list">
        {items.map(i => (
          <li key={i}>
            <ClientButton index={i} />
            <span>label {i}</span>
            <em>x</em>
          </li>
        ))}
      </ul>
    </Document>
  );
}

export const interact = [
  {click: 'button.cb', nth: 3},
  {expectText: {selector: 'button.cb', nth: 3, text: 'Clicks: 1'}},
  {expectCount: {selector: 'li', count: 'size'}},
];
