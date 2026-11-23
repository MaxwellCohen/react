import {Document} from './doc';
import Tabs from './client-children-inspect.tabs.client';
import Filter from './client-children-inspect.filter.client';

export const id = 'client-children-inspect';
export const title = 'Client components inspecting their server children';
export const category = 'composition';
export const description =
  'A client Tabs builds a tab strip from child.props.title of <section> children; a client Filter keeps <li> children by child.type and a data attribute.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 6, full: 120};

const KINDS = ['fruit', 'veg'];

export function Root({size}) {
  return (
    <Document title="Inspect children">
      <Tabs>
        <section title="Intro">
          <p>intro-text</p>
        </section>
        <section title="Details">
          <p>details-text</p>
          <p>More static details.</p>
        </section>
        <aside>Ignored by Tabs.</aside>
        <section title="Notes">
          <p>notes-text</p>
        </section>
      </Tabs>
      <Filter kinds={KINDS}>
        {Array.from({length: size}, (_, i) => (
          <li key={i} data-kind={KINDS[i % 2]}>
            Entry {i} ({KINDS[i % 2]})
          </li>
        ))}
        <p>Not a list item, dropped.</p>
      </Filter>
    </Document>
  );
}

export const interact = [
  {expectCount: {selector: '.tab', count: 3}},
  {expectText: {selector: '.tab', text: 'Intro'}},
  {expectText: {selector: '.active p', text: 'intro-text'}},
  {click: '.tab', nth: 2},
  {expectText: {selector: '.tab.selected', text: 'Notes'}},
  {expectText: {selector: '.active p', text: 'notes-text'}},
  {click: '.tab', nth: 0},
  {expectText: {selector: '.active p', text: 'intro-text'}},
  {expectCount: {selector: '.filter li', count: 'size'}},
  {click: 'button.kind-veg'},
  {expectCount: {selector: '.filter li', count: 3}},
  {click: 'button.kind-all'},
  {expectCount: {selector: '.filter li', count: 'size'}},
];
