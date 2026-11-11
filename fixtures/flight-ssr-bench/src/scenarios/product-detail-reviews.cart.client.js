'use client';

import {useState} from 'react';

export default function AddToCart() {
  const [n, setN] = useState(0);
  return (
    <button className="add-to-cart" onClick={() => setN(n + 1)}>
      In cart: {n}
    </button>
  );
}
