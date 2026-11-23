'use client';
import {useState} from 'react';

export default function ClientButton({index}) {
  const [n, setN] = useState(0);
  return (
    <button className="cb" onClick={() => setN(n + 1)}>
      Clicks: {n}
    </button>
  );
}
