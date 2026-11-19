'use client';

import {useState} from 'react';

export default function Counter({label}) {
  const [n, setN] = useState(0);
  return (
    <button className="counter" onClick={() => setN(n + 1)}>
      {label}: {n}
    </button>
  );
}
