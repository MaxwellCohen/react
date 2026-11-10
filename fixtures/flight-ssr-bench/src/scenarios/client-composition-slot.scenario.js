import {Document} from './doc';
import Panel from './client-composition-slot.panel.client';

export const id = 'client-composition-slot';
export const title = 'Client component with server-rendered children';
export const category = 'composition';
export const description =
  'A client Panel (toggle state) receives a server-rendered list as children and as a named slot prop.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 5, full: 200};
// REAL BUG (flags all on): the static server children of the client Panel are
// elided; hiding then re-showing them in the browser mounts the elided stub,
// which throws and leaves the list empty (matches=0).
export const knownFailure = {
  variants: ['all'],
  error:
    'Error: Static content that the server left out of this payload is needed on the client. This happens when a boundary is client rendered after a hydration mismatch. Refetch the page to recover.',
};

function ServerList({size}) {
  return (
    <ul className="items">
      {Array.from({length: size}, (_, i) => (
        <li key={i}>Server item {i}</li>
      ))}
    </ul>
  );
}

export function Root({size}) {
  return (
    <Document title="Slot">
      <Panel title="Items" footer={<small>Server footer</small>}>
        <ServerList size={size} />
      </Panel>
      <p>Outside the panel.</p>
    </Document>
  );
}

export const interact = [
  {expectCount: {selector: '.items li', count: 'size'}},
  {click: 'button.toggle'},
  {expectCount: {selector: '.items li', count: 0}},
  {click: 'button.toggle'},
  {expectCount: {selector: '.items li', count: 'size'}},
  {expectText: {selector: 'footer small', text: 'Server footer'}},
];
