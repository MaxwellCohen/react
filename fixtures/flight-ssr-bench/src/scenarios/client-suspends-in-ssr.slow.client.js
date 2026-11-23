'use client';

import {use, useState} from 'react';

// One promise per render (keyed by the children element), resolved after a
// few timeouts, so SSR and hydration both suspend on it.
const promises = new WeakMap();
function slowData(key) {
  let p = promises.get(key);
  if (p === undefined) {
    p = new Promise(resolve => {
      setTimeout(() => setTimeout(() => setTimeout(resolve, 5), 5), 5);
    });
    promises.set(key, p);
  }
  return p;
}

export default function Slow({children}) {
  use(slowData(children));
  const [n, setN] = useState(0);
  return (
    <div className="slow">
      <button className="counter" onClick={() => setN(n + 1)}>
        n: {n}
      </button>
      <div className="inner">{children}</div>
    </div>
  );
}
