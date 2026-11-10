'use client';
import {useState} from 'react';

export default function Tabs({labels, panels}) {
  const [i, setI] = useState(0);
  return (
    <div className="tabs">
      {labels.map((l, n) => (
        <button key={n} className="tab" onClick={() => setI(n)}>{l}</button>
      ))}
      <section className="shown">{panels[i]}</section>
    </div>
  );
}
