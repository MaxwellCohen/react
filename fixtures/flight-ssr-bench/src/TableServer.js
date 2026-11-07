import {Suspense} from 'react';
import ProductTable from './components/ProductTable';
import {generateProducts} from './components/data';

// Server component: data generated on the server, rows are client refs, so
// product data is serialized into the Flight payload as TableRow props.
export default function TableServer({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <html>
      <body>
        <Suspense fallback={null}>
          <ProductTable products={products} />
        </Suspense>
      </body>
    </html>
  );
}
