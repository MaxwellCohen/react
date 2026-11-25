'use client';

import {useState} from 'react';

const ORDER = ['default', 'price', 'rating'];

export default function Sort() {
  const [i, setI] = useState(0);
  return (
    <button className="sort" onClick={() => setI((i + 1) % ORDER.length)}>
      Sort: {ORDER[i]}
    </button>
  );
}
