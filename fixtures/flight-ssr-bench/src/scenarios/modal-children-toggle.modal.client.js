'use client';
import {useState} from 'react';

export default function Modal({children}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="open" onClick={() => setOpen(true)}>open</button>
      {open ? (
        <div className="dlg" role="dialog">
          <button className="close" onClick={() => setOpen(false)}>close</button>
          {children}
        </div>
      ) : null}
    </div>
  );
}
