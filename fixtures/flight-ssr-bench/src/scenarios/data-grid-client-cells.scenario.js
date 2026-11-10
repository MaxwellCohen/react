import {Document} from './doc';
import Cell from './data-grid-client-cells.cell.client';

export const id = 'data-grid-client-cells';
export const title = '20-column data grid, all client cells';
export const category = 'table';
export const description =
  'Same wide grid, but every cell is a client component receiving its value as a prop (worst case for elision). size = rows.';
export const expectedBenefit = 'none';
export const sizes = {smoke: 10, full: 300};

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
                  <Cell key={c} value={cellValue(r, c)} />
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
  {click: 'td.cell', nth: 0},
  {expectCount: {selector: 'td.cell.hl', count: 1}},
  {expectCount: {selector: 'tr.row', count: 'size'}},
];
