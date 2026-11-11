'use client';

import {useState} from 'react';

export default function CartCounter() {
  const [n, setN] = useState(0);
  return (
    <button className="cart-add" onClick={() => setN(n + 1)}>
      Cart: {n}
    </button>
  );
}
