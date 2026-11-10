import {Document} from './doc';
import Form from './server-action-form.form.client';

export const id = 'server-action-form';
export const title = 'Form with useActionState and a client-side action';
export const category = 'client';
export const description =
  'No server-function infrastructure in the fixture: a client form with useActionState and a client-side action, static server markup as children.';
export const expectedBenefit = 'low';

export function Root() {
  return (
    <Document title="Form">
      <Form>
        <label htmlFor="q" className="lbl">Query</label>
        <p className="help">Static server help text.</p>
      </Form>
    </Document>
  );
}

export const interact = [
  {expectText: {selector: '.res', text: 'none'}},
  {fill: '#q', value: 'abc'},
  {click: 'button.save'},
  {expectText: {selector: '.res', text: 'Saved: abc (1)'}},
  {expectText: {selector: '.help', text: 'Static server help text.'}},
];
