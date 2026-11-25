import {Document} from './doc';
import Echo from './full-refresh-focus.echo.client';

export const id = 'full-refresh-focus';
export const title = 'Typed input value must survive a full refetch';
export const category = 'static';
export const description =
  'Static server form markup with an uncontrolled input; the user types, the page is refetched (client navigation with full Flight), and the typed value must survive.';
export const expectedBenefit = 'low';

export function Root() {
  return (
    <Document title="Refresh focus">
      <form className="f" action="#">
        <label htmlFor="q">Search</label>
        <input id="q" name="q" />
        <textarea id="t" name="t" />
      </form>
      <Echo />
    </Document>
  );
}

export const interact = [
  {fill: '#q', value: 'typed-value'},
  {navigate: true},
  {click: 'button.read'},
  {expectText: {selector: '.echo', text: 'typed-value'}},
];
