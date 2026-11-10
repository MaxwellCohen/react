'use client';
import {useState} from 'react';

export default function Layout({header, footer, sidebar, slots, children}) {
  const [n, setN] = useState(0);
  return (
    <div className="layout">
      <header>{header}</header>
      <aside>{sidebar}</aside>
      <main>
        <button className="n" onClick={() => setN(n + 1)}>n: {n}</button>
        {children}
        <div className="slots">{slots.map(s => s)}</div>
      </main>
      <footer>{footer}</footer>
    </div>
  );
}
