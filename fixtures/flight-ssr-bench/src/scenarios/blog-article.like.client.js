'use client';

import {useState} from 'react';

export default function Like() {
  const [n, setN] = useState(0);
  return (
    <button className="like" onClick={() => setN(n + 1)}>
      Like: {n}
    </button>
  );
}
