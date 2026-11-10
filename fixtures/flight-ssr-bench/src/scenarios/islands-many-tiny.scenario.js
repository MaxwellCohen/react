import {Document} from './doc';
import ClickCount from './islands-many-tiny.island.client';

export const id = 'islands-many-tiny';
export const title = 'Long article with a tiny island after every paragraph';
export const category = 'composition';
export const description =
  'Long static article where each paragraph is followed by a tiny client click-counter island. size = paragraphs.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 10, full: 500};

const words = [
  'render', 'server', 'payload', 'client', 'stream', 'chunk', 'boundary', 'hydrate',
  'element', 'tree', 'module', 'reference', 'browser', 'cache', 'route', 'static',
];

// Deterministic paragraph i: 40-ish words picked by index arithmetic.
function paragraph(i) {
  const out = [];
  for (let j = 0; j < 40; j++) out.push(words[(i * 5 + j * 3) % words.length]);
  return 'Section ' + (i + 1) + '. ' + out.join(' ') + '.';
}

export function Root({size}) {
  const ps = [];
  for (let i = 0; i < size; i++) ps.push(i);
  return (
    <Document title="Long article">
      <header>
        <h1>Notes on streaming server rendering</h1>
        <p className="byline">Written for the flight team, {size} sections</p>
      </header>
      <article>
        {ps.map(i => (
          <div className="block" key={i}>
            <p>{paragraph(i)}</p>
            <ClickCount index={i} />
          </div>
        ))}
      </article>
      <footer>
        <p>End of article.</p>
      </footer>
    </Document>
  );
}

export const interact = [
  {click: 'button.island', nth: 5},
  {expectText: {selector: 'button.island', nth: 5, text: 'Clicks: 1'}},
  {expectCount: {selector: 'button.island', count: 'size'}},
];
