'use client';
import {useState} from 'react';

export default function Leaf() {
  const [n, setN] = useState(0);
  return <button className="leaf" onClick={() => setN(n + 1)}>leaf {n}</button>;
}
