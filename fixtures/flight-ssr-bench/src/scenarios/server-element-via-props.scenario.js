import {Document} from './doc';
import Layout from './server-element-via-props.layout.client';

export const id = 'server-element-via-props';
export const title = 'Server elements passed through several non-children props';
export const category = 'composition';
export const description =
  'A client Layout renders server elements from header/footer/sidebar/slots props immediately (no toggling).';
export const expectedBenefit = 'low';

export function Root() {
  return (
    <Document title="Props">
      <Layout
        header={<h1 className="h">Server header</h1>}
        footer={<small className="f">Server footer</small>}
        sidebar={[
          <nav key="n1" className="sb"><a href="#a">A</a></nav>,
          <nav key="n2" className="sb"><a href="#b">B</a></nav>,
        ]}
        slots={[
          <p key="s0" className="slot">slot-0</p>,
          <p key="s1" className="slot">slot-1</p>,
        ]}
      >
        <p className="kid">child</p>
      </Layout>
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '.h', text: 'Server header'}},
  {expectText: {selector: '.f', text: 'Server footer'}},
  {expectCount: {selector: '.sb', count: 2}},
  {expectText: {selector: '.slot', nth: 1, text: 'slot-1'}},
  {click: 'button.n'},
  {expectText: {selector: 'button.n', text: 'n: 1'}},
  {expectText: {selector: '.slot', nth: 0, text: 'slot-0'}},
  {expectText: {selector: '.kid', text: 'child'}},
];
