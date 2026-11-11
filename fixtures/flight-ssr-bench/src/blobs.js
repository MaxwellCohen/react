import {generateProducts} from './components/data';

// Deterministic static blobs that do not change until the next navigation.

// ~244KB of inline CSS (what e.g. Next's inlineCss emits).
export function makeCss(targetBytes = 244000) {
  let css = '';
  for (let i = 0; css.length < targetBytes; i++) {
    css +=
      '.c' +
      i +
      '{color:#' +
      ((i * 2654435761) >>> 8).toString(16).padStart(6, '0').slice(0, 6) +
      ';margin:' +
      (i % 17) +
      'px ' +
      (i % 5) +
      'px;padding:' +
      (i % 11) +
      'px;display:flex;flex-direction:column;border:1px solid rgba(0,0,0,.' +
      (i % 9) +
      ')}.c' +
      i +
      ':hover>.d' +
      i +
      '{opacity:.' +
      (i % 10) +
      '}\n';
  }
  return css;
}

// ~143KB of schema.org JSON-LD.
export function makeJsonLd(targetBytes = 143000) {
  const items = [];
  let size = 0;
  const products = generateProducts(400);
  for (let i = 0; size < targetBytes; i++) {
    const p = products[i % products.length];
    const item = {
      '@type': 'Product',
      position: i + 1,
      name: p.name,
      sku: p.sku + '-' + i,
      category: p.category,
      description: p.name + ' ' + p.category + ' ' + p.sku,
      offers: {'@type': 'Offer', price: p.price, priceCurrency: 'USD'},
      aggregateRating: {'@type': 'AggregateRating', ratingValue: p.rating},
    };
    size += JSON.stringify(item).length + 1;
    items.push(item);
  }
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items,
  });
}
