'use client';

import {useState} from 'react';

export default function ClientPage({size}) {
  const [n, setN] = useState(0);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>All client</title>
      </head>
      <body>
        <h1>All client</h1>
        <button id="inc" onClick={() => setN(n + 1)}>
          +
        </button>
        <p id="count">Count: {n}</p>
        <ul>
          {Array.from({length: size}, (_, i) => (
            <li key={i}>Row {i}</li>
          ))}
        </ul>
      </body>
    </html>
  );
}
