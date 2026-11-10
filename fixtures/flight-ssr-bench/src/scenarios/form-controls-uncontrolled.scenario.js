import {Document} from './doc';
import Counter from './form-controls-uncontrolled.counter.client';

export const id = 'form-controls-uncontrolled';
export const title = 'Uncontrolled form controls';
export const category = 'static';
export const description =
  'Server-rendered forms with uncontrolled inputs: defaultValue, defaultChecked, select with optgroup, textarea, radio groups, labels, fieldsets, disabled and readOnly controls. One client counter.';
export const expectedBenefit = 'high';
// size = number of repeated field groups.
export const sizes = {smoke: 2, full: 100};

export function Root({size}) {
  const groups = Array.from({length: size}, (_, i) => i);
  return (
    <Document title="Form controls">
      <main id="main">
        <h1>Uncontrolled form controls</h1>
        <form id="form">
          {groups.map((i) => (
            <fieldset key={i}>
              <legend>Group {i}</legend>
              <label htmlFor={'name-' + i}>Name {i}</label>
              <input
                id={'name-' + i}
                name={'name-' + i}
                defaultValue={'Value ' + i}
              />
              <label htmlFor={'bio-' + i}>Bio {i}</label>
              <textarea
                id={'bio-' + i}
                name={'bio-' + i}
                defaultValue={'Line one of ' + i + '\nLine two of ' + i}
              />
              <label>
                <input
                  type="checkbox"
                  name={'check-' + i}
                  defaultChecked={i % 2 === 0}
                />{' '}
                Check {i}
              </label>
              <fieldset>
                <legend>Choice {i}</legend>
                <label>
                  <input
                    type="radio"
                    name={'radio-' + i}
                    value="a"
                    defaultChecked={i % 3 === 0}
                  />{' '}
                  A{i}
                </label>
                <label>
                  <input type="radio" name={'radio-' + i} value="b" /> B{i}
                </label>
                <label>
                  <input type="radio" name={'radio-' + i} value="c" disabled /> C
                  {i}
                </label>
              </fieldset>
              <label htmlFor={'flavor-' + i}>Flavor {i}</label>
              <select id={'flavor-' + i} name={'flavor-' + i} defaultValue={'b' + i}>
                <optgroup label="Sweet">
                  <option value={'a' + i}>Vanilla {i}</option>
                  <option value={'b' + i}>Chocolate {i}</option>
                </optgroup>
                <optgroup label="Fruit" disabled>
                  <option value={'c' + i}>Lemon {i}</option>
                </optgroup>
              </select>
              <label htmlFor={'code-' + i}>Code {i}</label>
              <input
                id={'code-' + i}
                name={'code-' + i}
                defaultValue={'CODE-' + i}
                readOnly
              />
              <input
                name={'gone-' + i}
                defaultValue="disabled value"
                disabled
              />
            </fieldset>
          ))}
          <button type="submit" disabled>
            Submit
          </button>
        </form>
        <Counter />
      </main>
    </Document>
  );
}

export const interact = [
  {fill: 'input#name-0', value: 'Grace'},
  {click: 'button.counter'},
  {expectText: {selector: 'button.counter', text: 'n: 1'}},
];
