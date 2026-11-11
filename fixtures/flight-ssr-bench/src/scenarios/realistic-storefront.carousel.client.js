'use client';

import {useState} from 'react';

export default function Carousel({count}) {
  const [i, setI] = useState(0);
  return (
    <button className="carousel-next" onClick={() => setI((i + 1) % count)}>
      Slide {i + 1} of {count}
    </button>
  );
}
