import {Document} from './doc';
import Tabs from './tabs-panels-prop.tabs.client';

export const id = 'tabs-panels-prop';
export const title = 'Client Tabs with server elements in a panels prop';
export const category = 'composition';
export const description =
  'A client Tabs receives server-rendered static elements in a non-children `panels` array and switches which one is shown.';
export const expectedBenefit = 'low';

export function Root() {
  return (
    <Document title="Tabs">
      <Tabs
        labels={['A', 'B', 'C']}
        panels={[
          <div key="a" className="p"><p>panel-A</p></div>,
          <div key="b" className="p"><p>panel-B</p></div>,
          <div key="c" className="p"><p>panel-C</p></div>,
        ]}
      />
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '.shown p', text: 'panel-A'}},
  {click: '.tab', nth: 1},
  {expectText: {selector: '.shown p', text: 'panel-B'}},
  {click: '.tab', nth: 2},
  {expectText: {selector: '.shown p', text: 'panel-C'}},
  {click: '.tab', nth: 0},
  {expectText: {selector: '.shown p', text: 'panel-A'}},
];

// Silent wrong content: the client keeps showing the adopted panel A (review finding 1).
export const knownFailure = {variants: ['all'], error: 'interact[2] expectText .shown p "panel-B": still shows "panel-A"'};
