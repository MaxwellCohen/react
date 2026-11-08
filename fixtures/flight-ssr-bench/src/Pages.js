import {Suspense} from 'react';
import {unstable_pruneForBrowser as prune} from 'react-server-dom-webpack/server';
import TableRow from './components/TableRow';
import TableServerHost from './TableServerHost';
import TableRowLean from './components/TableRowLean';
import Counter from './components/Counter';
import {generateProducts} from './components/data';
import {makeCss, makeJsonLd} from './blobs';

const css = makeCss();
const jsonLd = makeJsonLd();

const columns = [
  'name',
  'sku',
  'category',
  'price',
  'stock',
  'status',
  'rating',
];

function HostRows({products}) {
  return (
    <table className="product-table">
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
  );
}

function Doc({head, children}) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        {head}
      </head>
      <body>
        <Suspense fallback={null}>{children}</Suspense>
      </body>
    </html>
  );
}

// (i) large inline <style> + host table.
export function PageStyle({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <Doc head={<style dangerouslySetInnerHTML={{__html: css}} />}>
      <HostRows products={products} />
    </Doc>
  );
}

// (ii) large JSON-LD script + host table.
export function PageJsonLd({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <Doc
      head={
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: jsonLd}}
        />
      }>
      <HostRows products={products} />
    </Doc>
  );
}

// (iii) client-ref table passing only the props the row renders.
export function TableServerLean({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <Doc head={null}>
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
    </Doc>
  );
}

// Mixed: inline CSS + JSON-LD in <head>, static header/article/footer
// markup, lean client rows, and an interactive client component.
export function PageMixed({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <Doc
      head={
        <>
          <title>Products</title>
          <style dangerouslySetInnerHTML={{__html: css}} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{__html: jsonLd}}
          />
        </>
      }>
      <header className="site-header">
        <h1>Product catalog</h1>
        <nav>
          <a href="/">Home</a> <a href="/products">Products</a>{' '}
          <a href="/about">About</a>
        </nav>
      </header>
      <article className="intro">
        <p>
          Static marketing copy. It never changes until the next navigation, so
          the browser needs no Flight data for it.
        </p>
        <Counter label="Clicks" initial={0} />
      </article>
      <table className="product-table">
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
      <footer className="site-footer">
        <p>&copy; Example Corp. All rights reserved.</p>
      </footer>
    </Doc>
  );
}

export {TableServerHost};

const tableColumns = [
  {key: 'name', label: 'Product'},
  {key: 'sku', label: 'SKU'},
  {key: 'category', label: 'Category'},
  {key: 'price', label: 'Price'},
  {key: 'stock', label: 'Stock'},
  {key: 'status', label: 'Status'},
  {key: 'rating', label: 'Rating'},
];

// (iii-b) Same full-product props as TableServer, but nested data the row
// does not render is pruned from the browser stream (SSR still gets it).
export function TableServerPruned({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <Doc head={null}>
      <table className="product-table">
        <tbody>
          {products.map(p => {
            const product = {};
            for (const k in p) {
              product[k] =
                p[k] !== null && typeof p[k] === 'object' ? prune(p[k]) : p[k];
            }
            return (
              <TableRow key={p.id} product={product} columns={tableColumns} />
            );
          })}
        </tbody>
      </table>
    </Doc>
  );
}

// (iii-c) Stateless client rows: the browser adopts the server DOM for each row
// (stub <tr>), so neither props nor the component's JS are needed there.
export function TableServerStatic({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <Doc head={null}>
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
            {products.map(p =>
              prune(
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
                />,
                'tr'
              )
            )}
          </tbody>
        </table>
      </div>
    </Doc>
  );
}

// (iii-d) One elided row for the whole <tbody>. Stateless client rows: the browser adopts the server DOM for each row
// (stub <tr>), so neither props nor the component's JS are needed there.
export function TableServerStaticBody({itemCount}) {
  const products = generateProducts(itemCount);
  return (
    <Doc head={null}>
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
          {prune(
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
            </tbody>,
            'tbody'
          )}
        </table>
      </div>
    </Doc>
  );
}
