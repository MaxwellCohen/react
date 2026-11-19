import {Document} from './doc';
import Panel from './client-composition-slot.panel.client';

export const id = 'client-composition-slot';
export const title = 'Client component with server-rendered children';
export const category = 'composition';
export const description =
  'A client Panel (toggle state) receives a server-rendered list as children and as a named slot prop.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 5, full: 200};
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
