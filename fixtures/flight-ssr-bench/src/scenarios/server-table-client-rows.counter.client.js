'use client';

import {useState} from 'react';

export default function Counter({label, initial}) {
  const [n, setN] = useState(initial);
  return (
    <button className="counter" onClick={() => setN(n + 1)}>
      {label}: {n}
    </button>
  );
}
