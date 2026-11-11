import {Document} from './doc';

export const id = 'tiny-static';
export const title = 'Tiny static page';
export const category = 'static';
export const description = 'A few host elements, no client components, no styles.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 3, full: 12};

export function Root({size}) {
  return (
    <Document title="Tiny">
      <main id="main">
        <h1>Hello</h1>
        <p>Static server output.</p>
        <ul>
          {Array.from({length: size}, (_, i) => (
            <li key={i}>Item {i}</li>
          ))}
        </ul>
      </main>
    </Document>
  );
}

export const interact = [{expectText: {selector: 'h1', text: 'Hello'}}];
