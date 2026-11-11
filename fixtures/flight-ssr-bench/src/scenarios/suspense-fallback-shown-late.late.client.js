'use client';
import {use, useState} from 'react';

function Loaded({p}) {
  return <b className="done">{use(p)}</b>;
}

export default function Late() {
  const [p, setP] = useState(null);
  return (
    <div>
      <button className="go" onClick={() => setP(new Promise(r => setTimeout(() => r('loaded'), 80)))}>go</button>
      {p ? <Loaded p={p} /> : <b className="idle">idle</b>}
    </div>
  );
}
