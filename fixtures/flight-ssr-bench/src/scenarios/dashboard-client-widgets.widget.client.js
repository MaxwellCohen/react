'use client';

import {useState} from 'react';

const W = 160;
const H = 48;

export default function Widget({title, values}) {
  const [mode, setMode] = useState('line');
  const max = Math.max(...values);
  const step = W / (values.length - 1);
  const barW = W / values.length - 2;
  return (
    <div className="chart">
      <button className="widget-toggle" onClick={() => setMode(mode === 'line' ? 'bar' : 'line')}>
        {'Mode: ' + mode}
      </button>
      <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label={title}>
        {mode === 'line' ? (
          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            points={values.map((v, i) => (i * step).toFixed(1) + ',' + (H - (v / max) * H).toFixed(1)).join(' ')}
          />
        ) : (
          values.map((v, i) => (
            <rect
              key={i}
              x={(i * (W / values.length) + 1).toFixed(1)}
              y={(H - (v / max) * H).toFixed(1)}
              width={barW.toFixed(1)}
              height={((v / max) * H).toFixed(1)}
              fill="#2563eb"
            />
          ))
        )}
      </svg>
    </div>
  );
}
