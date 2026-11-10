import {Document} from './doc';
import {generateProducts} from '../components/data';
import CartCounter from './realistic-storefront.cart.client';
import Newsletter from './realistic-storefront.newsletter.client';
import Carousel from './realistic-storefront.carousel.client';

export const id = 'realistic-storefront';
export const title = 'Realistic storefront with leaf client widgets';
export const category = 'composition';
export const description =
  'Combined storefront page: header and nav, hero carousel, product grid, reviews, footer, inline <style> and JSON-LD, with three small client widgets (cart counter, newsletter form, carousel index) placed as leaves among server markup.';
export const expectedBenefit = 'high';
// size = number of products in the grid.
export const sizes = {smoke: 12, full: 200};

const CSS = [
  'body{margin:0;font-family:system-ui,sans-serif;color:#1d1d1f}',
  'header{display:flex;justify-content:space-between;padding:12px 24px;border-bottom:1px solid #ddd}',
  '.hero{padding:48px 24px;background:#f5f5f7}',
  '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;list-style:none;padding:0}',
  '.product{border:1px solid #e5e5e5;border-radius:8px;padding:12px}',
  '.reviews blockquote{margin:0 0 12px;border-left:3px solid #0071e3;padding-left:12px}',
  'footer{padding:24px;background:#111;color:#eee}',
].join('\n');

const LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: 'Example Storefront',
  url: 'https://store.example.test/',
});

const SLIDES = ['Spring collection', 'Summer essentials', 'Autumn sale'];

const REVIEWS = [
  {who: 'Alice', text: 'Fast delivery and great packaging.'},
  {who: 'Bob', text: 'Exactly as pictured. Five stars.'},
  {who: 'Carol', text: 'Good value, but the strap is thin.'},
];

function Card({p}) {
  return (
    <li className="product">
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt={p.name} width={160} height={160} />
      <h3>{p.name}</h3>
      <p className="price">${p.price}</p>
      <p>
        {p.rating} stars, {p.reviewCount} reviews
      </p>
      <a href={'/products/' + p.id}>Details</a>
    </li>
  );
}

export function Root({size}) {
  const products = generateProducts(size);
  return (
    <Document
      title="Example Storefront"
      head={
        <>
          <style dangerouslySetInnerHTML={{__html: CSS}} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{__html: LD}} />
        </>
      }>
      <header>
        <strong>Example Storefront</strong>
        <nav>
          <a href="/men">Men</a> <a href="/women">Women</a> <a href="/sale">Sale</a> <a href="/cart">Cart</a>
        </nav>
        <CartCounter />
      </header>
      <section className="hero">
        <h1>Shop the season</h1>
        <p>Free shipping on orders over $50. Returns within 30 days.</p>
        <ol className="slides">
          {SLIDES.map(s => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Carousel count={SLIDES.length} />
      </section>
      <main>
        <h2>Products</h2>
        <ul className="grid">
          {products.map(p => (
            <Card key={p.id} p={p} />
          ))}
        </ul>
        <h2>What customers say</h2>
        <section className="reviews">
          {REVIEWS.map(r => (
            <blockquote key={r.who}>
              <p>{r.text}</p>
              <cite>{r.who}</cite>
            </blockquote>
          ))}
        </section>
        <h2>Newsletter</h2>
        <Newsletter />
      </main>
      <footer>
        <p>
          &copy; Example Storefront &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a>
        </p>
      </footer>
    </Document>
  );
}

export const interact = [
  {click: 'button.cart-add'},
  {click: 'button.cart-add'},
  {expectText: {selector: 'button.cart-add', text: 'Cart: 2'}},
  {click: 'button.carousel-next'},
  {expectText: {selector: 'button.carousel-next', text: 'Slide 2 of 3'}},
  {fill: 'input#newsletter-email', value: 'shopper@example.test'},
  {click: 'button.newsletter-submit'},
  {expectText: {selector: 'p.newsletter-status', text: 'Subscribed: shopper@example.test'}},
  {expectCount: {selector: 'li.product', count: 'size'}},
];
