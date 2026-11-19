'use client';

import {useState} from 'react';

export default function SelectedRow({initial}) {
  const [n, setN] = useState(initial);
  return (
    <button className="selected-row" onClick={() => setN(n + 1)}>
      {'Selected row: ' + n}
    </button>
  );
}
