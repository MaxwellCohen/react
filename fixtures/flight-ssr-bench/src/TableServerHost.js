import {Suspense} from 'react';
import {generateProducts} from './components/data';

const columns = [
  'name',
  'sku',
  'category',
  'price',
  'stock',
  'status',
  'rating',
];

export default function TableServerHost({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <html>
      <body>
        <Suspense fallback={null}>
          <table className="product-table">
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="table-row">
                  {columns.map(c => (
                    <td key={c}>{String(p[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Suspense>
      </body>
    </html>
  );
}
