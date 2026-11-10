import {Document} from './doc';
import Counter from './head-hoistables.counter.client';

export const id = 'head-hoistables';
export const title = 'Head hoistables from deep in the body';
export const category = 'static';
export const description =
  'Server components deep inside the body render <title>, <meta>, <link rel=preload>, and <style precedence> elements that React hoists into <head>. One client counter.';
export const expectedBenefit = 'low';
// size = number of content sections, each contributing one meta and one style.
export const sizes = {smoke: 3, full: 50};

export function Root({size}) {
  const sections = Array.from({length: size}, (_, i) => i);
  return (
    <Document title="Hoistables">
      <main id="main">
        <h1>Hoistables</h1>
        {sections.map((i) => (
          <section key={i} id={'section-' + i}>
            <title>Hoistables section {i}</title>
            <meta name={'hoistable-' + i} content={'value-' + i} />
            <link
              rel="preload"
              as="image"
              href={
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Ctext%3Ex-" +
                i +
                '%3C/text%3E%3C/svg%3E'
              }
            />
            <style href={'s-' + i} precedence="default">{`.sec-${i} { color: hsl(${i * 7 % 360}, 50%, 50%); padding: ${i % 10}px; }`}</style>
            <h2>Section {i}</h2>
            <p>Body content for section {i}.</p>
          </section>
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
