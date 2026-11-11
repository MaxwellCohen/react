import {Document} from './doc';
import SelectedRow from './data-grid-server-cells.selected-row.client';

export const id = 'data-grid-server-cells';
export const title = '20-column data grid, all server cells';
export const category = 'table';
export const description =
  'Wide data grid where every cell is pure server markup; one client selected-row button sits outside the grid. size = rows.';
export const expectedBenefit = 'high';
export const sizes = {smoke: 10, full: 1000};

const COLS = 20;
const cellValue = (r, c) => 'R' + r + '-C' + c + ':' + ((r * 31 + c * 17) % 997);

export function Root({size}) {
  const rows = [];
  for (let r = 0; r < size; r++) rows.push(r);
  const cols = [];
  for (let c = 0; c < COLS; c++) cols.push(c);
  return (
    <Document title="Data grid">
      <h1>Inventory ({size} rows)</h1>
      <SelectedRow initial={0} />
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} scope="col">
                  Column {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr className="row" key={r}>
                {cols.map(c => (
                  <td className="cell" key={c}>
                    {cellValue(r, c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Document>
  );
}

export const interact = [
  {click: 'button.selected-row', nth: 0},
  {expectText: {selector: 'button.selected-row', nth: 0, text: 'Selected row: 1'}},
  {expectCount: {selector: 'tr.row', count: 'size'}},
];
