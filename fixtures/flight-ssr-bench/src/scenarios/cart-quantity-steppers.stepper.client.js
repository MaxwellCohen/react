'use client';

import {useState} from 'react';

export default function QuantityStepper({label, initial}) {
  const [qty, setQty] = useState(initial);
  return (
    <div className="stepper">
      <button className="qty-dec" aria-label={'Decrease ' + label} onClick={() => setQty(Math.max(0, qty - 1))}>
        -
      </button>
      <span className="qty">{String(qty)}</span>
      <button className="qty-inc" aria-label={'Increase ' + label} onClick={() => setQty(qty + 1)}>
        +
      </button>
    </div>
  );
}
