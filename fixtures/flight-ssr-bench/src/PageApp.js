import {Suspense} from 'react';
import TableRowLean from './components/TableRowLean';
import TableRowServer from './components/TableRowServer';
import Counter from './components/Counter';
import {generateProducts} from './components/data';
import {makeCss, makeJsonLd} from './blobs';

const css = makeCss();
const jsonLd = makeJsonLd();

// Realistic page for the e2e + benchmark: inline CSS, JSON-LD, static chrome,
// a large table, and interactive client components mixed in (every 100th row
// has a Counter). makePage(false): rows are client components (full props in
// Flight, hydrated normally). makePage(true): rows are server components that
// render plain <tr> host elements (static server output, elidable).
export function makePage(serverRows) {
  const Row = serverRows ? TableRowServer : TableRowLean;
  return function PageApp({itemCount}) {
    const products = generateProducts(itemCount);
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <title>Products</title>
          <style dangerouslySetInnerHTML={{__html: css}} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{__html: jsonLd}}
          />
        </head>
        <body>
          <header className="site-header">
            <h1>Product catalog</h1>
            <nav>
              <a href="/">Home</a> <a href="/products">Products</a>
            </nav>
          </header>
          <Counter label="Top counter" initial={0} />
          <Suspense fallback={null}>
            <table className="product-table">
              <tbody>
                {products.map((p, i) => {
                  const row = (
                    <Row
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
                  );
                  if (i % 100 === 99) {
                    return (
                      <tr key={'c' + p.id}>
                        <td colSpan={7}>
                          <Counter label={'Row ' + i} initial={i} />
                        </td>
                      </tr>
                    );
                  }
                  return row;
                })}
              </tbody>
            </table>
          </Suspense>
          <footer className="site-footer">
            <p>&copy; Example Corp.</p>
          </footer>
        </body>
      </html>
    );
  };
}
