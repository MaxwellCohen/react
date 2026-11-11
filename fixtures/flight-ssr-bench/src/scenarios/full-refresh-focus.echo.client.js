'use client';
import {useState} from 'react';

export default function Echo() {
  const [v, setV] = useState('?');
  return (
    <div>
      <button className="read" onClick={() => setV(document.getElementById('q').value)}>read</button>
      <output className="echo">{v}</output>
    </div>
  );
}
