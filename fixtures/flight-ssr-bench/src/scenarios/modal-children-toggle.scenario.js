import {Document} from './doc';
import Modal from './modal-children-toggle.modal.client';

export const id = 'modal-children-toggle';
export const title = 'Client modal with server children, closed by default';
export const category = 'composition';
export const description =
  'A client modal is closed by default (children never rendered during SSR) and opened by click, mounting server-rendered static children.';
export const expectedBenefit = 'low';

export function Root() {
  return (
    <Document title="Modal">
      <Modal>
        <h2 className="mt">Modal title</h2>
        <p className="mb">Modal body from the server.</p>
      </Modal>
    </Document>
  );
}

export const interact = [
  {expectCount: {selector: '.dlg', count: 0}},
  {click: 'button.open'},
  {expectText: {selector: '.mb', text: 'Modal body from the server.'}},
  {click: 'button.close'},
  {expectCount: {selector: '.dlg', count: 0}},
  {click: 'button.open'},
  {expectText: {selector: '.mt', text: 'Modal title'}},
];

// Elided static content is mounted by a client render (review finding 1/2).
export const knownFailure = {variants: ['all'], error: 'Static content that the server left out of this payload is needed on the client. This happens when a boundary is client rendered after a hydration mismatch. Refetch the page to recover.'};
