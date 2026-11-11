import {Document} from './doc';
import {generateProducts} from '../components/data';
import Sort from './product-listing.sort.client';

export const id = 'product-listing';
export const title = 'Server-rendered product grid';
export const category = 'table';
export const description =
  'Grid of product cards rendered entirely by server components (pure host markup), with one client sort-label button outside the grid.';
export const expectedBenefit = 'high';
// size = number of products in the grid.
export const sizes = {smoke: 20, full: 1000};

function Card({p}) {
  return (
    <li className="product">
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt={p.name} width={160} height={160} />
      <h2>{p.name}</h2>
      <p className="sku">{p.sku}</p>
      <p className="category">{p.category}</p>
      <p className="price">${p.price}</p>
      <p className="rating">
        Rated {p.rating} ({p.reviewCount} reviews)
      </p>
      <p className="stock">{p.status}</p>
      <a href={'/products/' + p.id}>View details</a>
    </li>
  );
}

export function Root({size}) {
  const products = generateProducts(size);
  return (
    <Document title="All products">
      <header>
        <h1>All products</h1>
      </header>
      <Sort />
      <ul className="grid">
        {products.map(p => (
          <Card key={p.id} p={p} />
        ))}
      </ul>
    </Document>
  );
}

export const interact = [
  {click: 'button.sort'},
  {expectText: {selector: 'button.sort', text: 'Sort: price'}},
  {expectCount: {selector: 'li.product', count: 'size'}},
];
