'use client';
import {useState} from 'react';

export default function Counter() {
  const [n, setN] = useState(0);
  return <button className="c" onClick={() => setN(n + 1)}>c: {n}</button>;
}
