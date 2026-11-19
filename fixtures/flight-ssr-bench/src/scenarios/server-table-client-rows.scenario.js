import {Document} from './doc';
import {generateProducts} from '../components/data';
import Counter from './server-table-client-rows.counter.client';

export const id = 'server-table-client-rows';
export const title = 'Server-rendered table with a few client rows';
export const category = 'table';
export const description =
  'size rows rendered by server components; every 10th row (smoke) / 100th (full) holds a client counter.';
export const expectedBenefit = 'high';
export const sizes = {smoke: 30, full: 1000};

const cols = ['name', 'sku', 'category', 'price', 'stock', 'status', 'rating'];

function Row({p, index, interactive}) {
  return (
    <tr className="row">
      {cols.map(c => (
        <td key={c}>{String(p[c])}</td>
      ))}
      <td>
        {interactive ? <Counter label={'Row ' + index} initial={index} /> : '-'}
      </td>
    </tr>
  );
}

export function Root({size}) {
  const every = size >= 500 ? 100 : 10;
  return (
    <Document title="Table">
      <table>
        <tbody>
          {generateProducts(size).map((p, i) => (
            <Row key={p.id} p={p} index={i} interactive={i % every === 0} />
          ))}
        </tbody>
      </table>
    </Document>
  );
}

export const interact = [
  {click: 'button.counter'},
  {expectText: {selector: 'button.counter', text: 'Row 0: 1'}},
  {expectCount: {selector: 'tr.row', count: 'size'}},
];
