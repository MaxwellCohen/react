import {Document} from './doc';
import LongCell from './repeated-long-strings.cell.client';

export const id = 'repeated-long-strings';
export const title = 'Repeated long strings';
export const category = 'table';
export const description =
  'A table where every row repeats the same three 232-character strings as text and passes one of them as a prop to a client component.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 10, full: 500};

const SENTENCE = 'The quick brown fox jumps over the lazy dog. ';
const LONG_A = 'Alpha. ' + SENTENCE.repeat(5);
const LONG_B = 'Bravo. ' + SENTENCE.repeat(5);
const LONG_C = 'Charlie. ' + SENTENCE.repeat(5);

export function Root({size}) {
  return (
    <Document title="Repeated long strings">
      <main>
        <h1>Repeated long strings</h1>
        <table className="long-table">
          <tbody>
            {Array.from({length: size}, (_, i) => (
              <tr className="row" key={i}>
                <td>{LONG_A}</td>
                <td>{LONG_B}</td>
                <td>{LONG_C}</td>
                <td>
                  <LongCell value={LONG_A} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </Document>
  );
}

export const interact = [
  {expectCount: {selector: 'tr.row', count: 'size'}},
  {expectCount: {selector: 'div.long-cell', count: 'size'}},
  {expectText: {selector: 'div.long-cell', text: LONG_A.length + ' chars'}},
];
