import {Document} from './doc';
import Counter from './dangerous-inner-html.counter.client';

export const id = 'dangerous-inner-html';
export const title = 'dangerouslySetInnerHTML blocks';
export const category = 'static';
export const description =
  'Server-rendered dangerouslySetInnerHTML blocks containing rich HTML (nested tags, entities, attributes, inline SVG) mixed with normal JSX siblings. One client counter.';
export const expectedBenefit = 'high';
// size = number of dangerouslySetInnerHTML blocks.
export const sizes = {smoke: 3, full: 200};

function makeHtml(i) {
  const escape = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return [
    '<div class="block block-' + i + '" data-index="' + i + '">',
    '<h3>' + escape('Block & "title" <' + i + '>') + '</h3>',
    '<p style="margin:0;color:rgb(' + i % 256 + ',' + (i * 3) % 256 + ',' + (i * 7) % 256 + ')">',
    'Some <em>emphasized</em> and <strong>bold</strong> text with entities &amp; &lt; &gt; &quot; &#169; &#x2713;.',
    '</p>',
    '<ul><li>Item A-' + i + '</li><li>Item B-' + i + '</li></ul>',
    '<a href="/ref-' + i + '" title="Ref ' + i + '">Link ' + i + '</a>',
    '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><path d="M6 12 L12 6 L18 12" stroke="white" stroke-width="2" fill="none"></path></svg>',
    '</div>',
  ].join('');
}

export function Root({size}) {
  const blocks = Array.from({length: size}, (_, i) => i);
  return (
    <Document title="Inner HTML">
      <main id="main">
        <h1 dangerouslySetInnerHTML={{__html: 'Head &amp; <em>line</em>'}} />
        {blocks.map((i) => (
          <div key={i} className="row">
            <section
              id={'block-' + i}
              dangerouslySetInnerHTML={{__html: makeHtml(i)}}
            />
            <p className="sibling">JSX sibling after block {i}.</p>
          </div>
        ))}
        <Counter />
      </main>
    </Document>
  );
}

export const interact = [
  {click: 'button.counter'},
  {expectText: {selector: 'button.counter', text: 'n: 1'}},
];
