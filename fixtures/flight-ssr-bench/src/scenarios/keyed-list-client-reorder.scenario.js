import {Document} from './doc';
import List from './keyed-list-client-reorder.list.client';

export const id = 'keyed-list-client-reorder';
export const title = 'Client list reverses/filters keyed server <li> children';
export const category = 'composition';
export const description =
  'Server passes keyed static <li> elements as children to a client list that can reverse and filter them.';
export const expectedBenefit = 'low';

export function Root() {
  const keys = ['x', 'y', 'z', 'w', 'v'];
  return (
    <Document title="Keyed list">
      <List>
        {keys.map(k => (
          <li key={k} className="it">item-{k}</li>
        ))}
      </List>
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '.it', text: 'item-x'}},
  {click: '.rev'},
  {expectText: {selector: '.it', text: 'item-v'}},
  {expectText: {selector: '.it', nth: 4, text: 'item-x'}},
  {click: '.even'},
  {expectCount: {selector: '.it', count: 3}},
  {expectText: {selector: '.it', text: 'item-v'}},
  {expectText: {selector: '.it', nth: 2, text: 'item-x'}},
  {click: '.rev'},
  {click: '.even'},
  {expectCount: {selector: '.it', count: 5}},
  {expectText: {selector: '.it', text: 'item-x'}},
];

// Elided static content is mounted by a client render (review finding 1/2).
export const knownFailure = {variants: ['all'], error: 'Static content that the server left out of this payload is needed on the client. This happens when a boundary is client rendered after a hydration mismatch. Refetch the page to recover.'};
