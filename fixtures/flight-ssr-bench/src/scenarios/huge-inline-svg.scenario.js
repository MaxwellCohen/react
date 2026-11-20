import {Document} from './doc';
import Counter from './huge-inline-svg.counter.client';

export const id = 'huge-inline-svg';
export const title = 'Huge inline SVG';
export const category = 'static';
export const description =
  'A server-rendered inline <svg> with `size` rects and `size` paths derived from their index, plus one client counter.';
export const expectedBenefit = 'high';
export const sizes = {smoke: 20, full: 3000};

const palette = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'];

export function Root({size}) {
  return (
    <Document title="Inline SVG">
      <main>
        <h1>Inline SVG</h1>
        <svg viewBox="0 0 1000 700" width="400" height="280">
          {Array.from({length: size}, (_, i) => (
            <rect
              key={'r' + i}
              x={(i * 37) % 980}
              y={(i * 53) % 680}
              width={6 + (i % 5)}
              height={6 + (i % 7)}
              fill={palette[i % palette.length]}
            />
          ))}
          {Array.from({length: size}, (_, i) => (
            <path
              key={'p' + i}
              d={
                'M' +
                ((i * 11) % 1000) +
                ' ' +
                ((i * 7) % 700) +
                ' l' +
                (4 + (i % 6)) +
                ' ' +
                (4 + (i % 4)) +
                ' h-' +
                (4 + (i % 3)) +
                ' z'
              }
              fill="none"
              stroke={palette[(i + 2) % palette.length]}
              strokeWidth={1 + (i % 3)}
            />
          ))}
        </svg>
        <Counter label="svg" />
      </main>
    </Document>
  );
}

export const interact = [
  {click: 'button.counter'},
  {expectText: {selector: 'button.counter', text: 'svg: 1'}},
  {expectCount: {selector: 'svg rect', count: 'size'}},
  {expectCount: {selector: 'svg path', count: 'size'}},
];
