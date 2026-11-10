import {Document} from './doc';
import Like from './blog-article.like.client';

export const id = 'blog-article';
export const title = 'Long blog article';
export const category = 'static';
export const description =
  'Long article with headings, many paragraphs, code blocks, images with alt/width/height and blockquotes, plus one small client like button.';
export const expectedBenefit = 'high';
// size = number of article sections.
export const sizes = {smoke: 8, full: 300};

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const TOPICS = ['streaming', 'caching', 'hydration', 'bundling', 'routing', 'suspense'];

function sentence(i, j) {
  const t = TOPICS[(i + j) % TOPICS.length];
  return (
    'Section ' + i + ' paragraph ' + j + ' explains how ' + t + ' interacts with the rendering pipeline, ' +
    'including the trade-offs around payload size, ordering, and the cost of repeated work on each navigation.'
  );
}

function Code({i}) {
  const src =
    'export function step' + i + '(input) {\n' +
    '  const out = input.map(x => x * ' + ((i % 7) + 2) + ');\n' +
    '  return out.filter(Boolean);\n' +
    '}';
  return (
    <pre>
      <code className="language-js">{src}</code>
    </pre>
  );
}

function Section({i}) {
  return (
    <section>
      <h2>Part {i + 1}: notes on {TOPICS[i % TOPICS.length]}</h2>
      <p>{sentence(i, 0)}</p>
      <p>{sentence(i, 1)}</p>
      <img src={PIXEL} alt={'Diagram ' + i + ' for ' + TOPICS[i % TOPICS.length]} width={640} height={360} />
      <p>{sentence(i, 2)}</p>
      <blockquote>
        <p>Measure first. Section {i} is a reminder that {TOPICS[i % TOPICS.length]} wins are easy to lose.</p>
      </blockquote>
      <p>{sentence(i, 3)}</p>
      <Code i={i} />
      <p>{sentence(i, 4)}</p>
    </section>
  );
}

export function Root({size}) {
  const sections = [];
  for (let i = 0; i < size; i++) sections.push(<Section key={i} i={i} />);
  return (
    <Document title="Notes on rendering">
      <header>
        <nav>
          <a href="/">Blog</a> <a href="/archive">Archive</a>
        </nav>
      </header>
      <main>
        <article>
          <h1>Notes on rendering pipelines</h1>
          <p className="byline">By the platform team</p>
          <Like />
          {sections}
        </article>
      </main>
      <footer>
        <p>Thanks for reading.</p>
      </footer>
    </Document>
  );
}

export const interact = [
  {click: 'button.like'},
  {expectText: {selector: 'button.like', text: 'Like: 1'}},
  {expectCount: {selector: 'article h2', count: 'size'}},
];
