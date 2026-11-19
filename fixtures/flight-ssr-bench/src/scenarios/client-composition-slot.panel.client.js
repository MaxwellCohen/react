'use client';

import {useState} from 'react';

export default function Panel({title, footer, children}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="panel">
      <h2>{title}</h2>
      <button className="toggle" onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'}
      </button>
      {open ? <div className="panel-body">{children}</div> : null}
      <footer>{footer}</footer>
    </section>
  );
}
