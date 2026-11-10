import {Document} from './doc';
import QuantityStepper from './cart-quantity-steppers.stepper.client';

export const id = 'cart-quantity-steppers';
export const title = 'Cart with quantity steppers';
export const category = 'ecommerce';
export const description =
  'Ecommerce cart: every line item is server markup with one client quantity stepper as a leaf. size = line items.';
export const expectedBenefit = 'low';
export const sizes = {smoke: 5, full: 100};

const money = cents => '$' + (cents / 100).toFixed(2);
const unitCents = i => ((i * 17 + 3) % 9999) + 100;
const qtyOf = i => (i % 3) + 1;

export function Root({size}) {
  let total = 0;
  const lines = [];
  for (let i = 0; i < size; i++) {
    total += unitCents(i) * qtyOf(i);
    lines.push(i);
  }
  return (
    <Document title="Your cart">
      <header className="site-header">
        <a href="/">Store</a>
        <nav>
          <a href="/cart">Cart</a> <a href="/account">Account</a>
        </nav>
      </header>
      <main>
        <h1>Your cart ({size} items)</h1>
        <ul className="cart">
          {lines.map(i => (
            <li className="line" key={i}>
              <img alt="" width="64" height="64" src={'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22%3E%3Ctext y=%2232%22%3E' + (i % 40) + '%3C/text%3E%3C/svg%3E'} />
              <div className="line-info">
                <h2>Product {i}</h2>
                <p className="sku">SKU-{String(i).padStart(6, '0')}</p>
                <p className="unit">{money(unitCents(i)) + ' each'}</p>
              </div>
              <QuantityStepper label={'Product ' + i} initial={qtyOf(i)} />
              <p className="subtotal">{money(unitCents(i) * qtyOf(i))}</p>
            </li>
          ))}
        </ul>
        <aside className="summary">
          <h2>Order summary</h2>
          <p>Subtotal: {money(total)}</p>
          <p>Shipping: free over $50.00</p>
          <p>Estimated total: {money(total)}</p>
          <a className="checkout" href="/checkout">Checkout</a>
        </aside>
      </main>
      <footer>
        <p>Free returns within 30 days.</p>
      </footer>
    </Document>
  );
}

export const interact = [
  {click: 'button.qty-inc', nth: 0},
  {expectText: {selector: 'span.qty', nth: 0, text: '2'}},
  {click: 'button.qty-inc', nth: 1},
  {expectText: {selector: 'span.qty', nth: 1, text: '3'}},
  {expectCount: {selector: 'li.line', count: 'size'}},
];
