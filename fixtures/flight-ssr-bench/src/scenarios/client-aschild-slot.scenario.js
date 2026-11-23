import {Document} from './doc';
import Slot from './client-aschild-slot.slot.client';

export const id = 'client-aschild-slot';
export const title = 'Client Slot cloning a server-rendered anchor';
export const category = 'composition';
export const description =
  'size client Slots, each does cloneElement(Children.only(children), {className, onClick}) around a server <a href> with static content inside.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 5, full: 300};

export function Root({size}) {
  return (
    <Document title="As child">
      <nav>
        {Array.from({length: size}, (_, i) => (
          <Slot key={i} className="btn">
            <a href={'#item-' + i}>
              <span className="label">Item {i}</span>
              <small>
                Static description for item {i}, rendered on the server.
              </small>
            </a>
          </Slot>
        ))}
      </nav>
    </Document>
  );
}

export const interact = [
  {expectCount: {selector: 'a.btn', count: 'size'}},
  {expectCount: {selector: 'a.clicked', count: 0}},
  {click: 'a.btn', nth: 0},
  {expectCount: {selector: 'a.clicked', count: 1}},
  {click: 'a.btn', nth: 2},
  {expectCount: {selector: 'a.clicked', count: 2}},
  {expectText: {selector: 'a.btn .label', text: 'Item 0'}},
];
