import {Suspense} from 'react';
import TableRowLean from './components/TableRowLean';
import {generateProducts} from './components/data';

// Like-for-like Fizz baseline for h-table-lean: same <html>/<Suspense> shell
// and same TableRowLean markup, but no RSC (the row is a plain component).
export default function FizzSame({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>
        <Suspense fallback={null}>
          <div className="product-table-container">
            <table className="product-table">
              <thead>
                <tr>
                  {[
                    'Product',
                    'SKU',
                    'Category',
                    'Price',
                    'Stock',
                    'Status',
                    'Rating',
                  ].map(l => (
                    <th key={l}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <TableRowLean
                    key={p.id}
                    name={p.name}
                    category={p.category}
                    sku={p.sku}
                    price={p.price}
                    stock={p.stock}
                    status={p.status}
                    rating={p.rating}
                    reviewCount={p.reviewCount}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Suspense>
      </body>
    </html>
  );
}
