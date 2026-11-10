import {Document} from './doc';
import {makeCss, makeJsonLd} from '../blobs';
import Cta from './marketing-style-jsonld.cta.client';

export const id = 'marketing-style-jsonld';
export const title = 'Marketing page with inline CSS and JSON-LD';
export const category = 'static';
export const description =
  'Large inline <style> and JSON-LD <script> emitted by a server component, plus static chrome and one client counter.';
export const expectedBenefit = 'high';
// size = target bytes of the CSS (JSON-LD is a quarter of it).
export const sizes = {smoke: 20000, full: 244000};

export function Root({size}) {
  const css = makeCss(size);
  const ld = makeJsonLd(Math.floor(size / 4));
  return (
    <Document
      title="Acme"
      head={
        <>
          <style dangerouslySetInnerHTML={{__html: css}} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{__html: ld}}
          />
        </>
      }>
      <header>
        <nav>
          <a href="/">Home</a> <a href="/pricing">Pricing</a>
        </nav>
      </header>
      <main>
        <h1>Ship faster</h1>
        <section>
          <h2>Features</h2>
          <ul>
            <li>Fast</li>
            <li>Cheap</li>
            <li>Good</li>
          </ul>
        </section>
        <Cta />
      </main>
      <footer>(c) Acme</footer>
    </Document>
  );
}

export const interact = [
  {click: 'button.cta'},
  {expectText: {selector: 'button.cta', text: 'Signed up: 1'}},
];
