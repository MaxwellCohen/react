import {Document} from './doc';
import {generateProducts} from '../components/data';
import AddToCart from './product-detail-reviews.cart.client';

export const id = 'product-detail-reviews';
export const title = 'Product detail with reviews, specs and JSON-LD';
export const category = 'static';
export const description =
  'Product detail page with a JSON-LD script rendered directly by the server component, a specs table, and a list of size reviews; one client add-to-cart counter.';
export const expectedBenefit = 'high';
// size = number of reviews.
export const sizes = {smoke: 10, full: 300};

const AUTHORS = ['Alice J.', 'Bob W.', 'Carol D.', 'Dan M.', 'Eve W.', 'Frank M.'];
const BODIES = [
  'Solid build and the instructions were clear. Would buy again.',
  'Works as described, though packaging could be better.',
  'Returned it after a week; the finish scratched easily.',
  'Excellent value. The materials feel premium for the price.',
];

function reviewsFor(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 'r' + i,
      author: AUTHORS[i % AUTHORS.length],
      rating: (i * 7 + 3) % 5 + 1,
      date: '2026-02-' + String((i % 28) + 1).padStart(2, '0'),
      body: BODIES[i % BODIES.length] + ' (review ' + i + ')',
      helpful: (i * 11 + 2) % 50,
    });
  }
  return out;
}

function Review({r}) {
  return (
    <article className="review" id={r.id}>
      <header>
        <strong>{r.author}</strong> <span>{'★'.repeat(r.rating)}</span> <time dateTime={r.date}>{r.date}</time>
      </header>
      <p>{r.body}</p>
      <footer>{r.helpful} people found this helpful</footer>
    </article>
  );
}

export function Root({size}) {
  const p = generateProducts(1)[0];
  const reviews = reviewsFor(size);
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    category: p.category,
    offers: {'@type': 'Offer', price: p.price, priceCurrency: 'USD'},
    aggregateRating: {'@type': 'AggregateRating', ratingValue: p.rating, reviewCount: reviews.length},
    review: reviews.map(r => ({
      '@type': 'Review',
      author: {'@type': 'Person', name: r.author},
      reviewRating: {'@type': 'Rating', ratingValue: r.rating},
      datePublished: r.date,
      reviewBody: r.body,
    })),
  });
  return (
    <Document title={p.name}>
      <main>
        <h1>{p.name}</h1>
        <p className="price">${p.price}</p>
        <p>{p.description}</p>
        <AddToCart />
        <script type="application/ld+json" dangerouslySetInnerHTML={{__html: ld}} />
        <h2>Specifications</h2>
        <table>
          <tbody>
            <tr>
              <th>Material</th>
              <td>{p.specifications.material}</td>
            </tr>
            <tr>
              <th>Color</th>
              <td>{p.specifications.color}</td>
            </tr>
            <tr>
              <th>Warranty</th>
              <td>{p.specifications.warranty}</td>
            </tr>
            <tr>
              <th>Weight</th>
              <td>{p.dimensions.weight} kg</td>
            </tr>
            <tr>
              <th>Dimensions</th>
              <td>
                {p.dimensions.width} x {p.dimensions.height} x {p.dimensions.depth} {p.dimensions.unit}
              </td>
            </tr>
          </tbody>
        </table>
        <h2>Reviews ({reviews.length})</h2>
        <section className="reviews">
          {reviews.map(r => (
            <Review key={r.id} r={r} />
          ))}
        </section>
      </main>
    </Document>
  );
}

export const interact = [
  {click: 'button.add-to-cart'},
  {click: 'button.add-to-cart'},
  {expectText: {selector: 'button.add-to-cart', text: 'In cart: 2'}},
  {expectCount: {selector: 'article.review', count: 'size'}},
];
