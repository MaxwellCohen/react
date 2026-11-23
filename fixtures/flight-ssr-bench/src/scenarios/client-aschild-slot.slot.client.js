'use client';

import {Children, cloneElement, useState} from 'react';

// asChild pattern: clones the single server-rendered child with props.
export default function Slot({className, children}) {
  const [clicks, setClicks] = useState(0);
  return cloneElement(Children.only(children), {
    className: className + (clicks > 0 ? ' clicked' : ''),
    onClick: e => {
      e.preventDefault();
      setClicks(clicks + 1);
    },
  });
}
