'use client';

import {useState} from 'react';

export default function Cell({value}) {
  const [hl, setHl] = useState(false);
  return (
    <td className={hl ? 'cell hl' : 'cell'} onClick={() => setHl(!hl)}>
      {value}
    </td>
  );
}
