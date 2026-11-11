'use client';

import {useState} from 'react';

export default function ClickCount({index}) {
  const [n, setN] = useState(0);
  return (
    <button className="island" data-index={index} onClick={() => setN(n + 1)}>
      {'Clicks: ' + n}
    </button>
  );
}
