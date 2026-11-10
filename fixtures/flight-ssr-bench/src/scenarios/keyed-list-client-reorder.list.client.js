'use client';
import {Children, useState} from 'react';

export default function List({children}) {
  const [rev, setRev] = useState(false);
  const [even, setEven] = useState(false);
  let items = Children.toArray(children);
  if (even) items = items.filter((_, i) => i % 2 === 0);
  if (rev) items = items.slice().reverse();
  return (
    <div>
      <button className="rev" onClick={() => setRev(r => !r)}>reverse</button>
      <button className="even" onClick={() => setEven(e => !e)}>even</button>
      <ul className="list">{items}</ul>
    </div>
  );
}
