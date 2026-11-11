'use client';

import {useState} from 'react';

export default function Cta() {
  const [n, setN] = useState(0);
  return (
    <button className="cta" onClick={() => setN(n + 1)}>
      Signed up: {n}
    </button>
  );
}
