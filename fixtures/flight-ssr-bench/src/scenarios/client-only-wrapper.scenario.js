import {Document} from './doc';
import ClientOnly from './client-only-wrapper.clientonly.client';

export const id = 'client-only-wrapper';
export const title = 'ClientOnly wrapper mounting static server children after an effect';
export const category = 'client';
export const description =
  'A client ClientOnly renders nothing on the first render and mounts its server-provided static children after an effect.';
export const expectedBenefit = 'low';

export function Root() {
  return (
    <Document title="Client only">
      <p>before</p>
      <ClientOnly>
        <section className="co"><p>only-in-browser</p></section>
      </ClientOnly>
      <p>after</p>
    </Document>
  );
}

export const interact = [{expectText: {selector: '.co p', text: 'only-in-browser'}}];

// Elided static content is mounted by a client render (review finding 1/2).
export const knownFailure = {variants: ['all'], error: 'Static content that the server left out of this payload is needed on the client. This happens when a boundary is client rendered after a hydration mismatch. Refetch the page to recover.'};
