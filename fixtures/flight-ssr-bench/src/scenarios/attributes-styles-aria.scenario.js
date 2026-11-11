import {Document} from './doc';
import Counter from './attributes-styles-aria.counter.client';

export const id = 'attributes-styles-aria';
export const title = 'Attribute, style and ARIA variety';
export const category = 'static';
export const description =
  'Server host elements with many attribute kinds: className, style objects (numeric values, CSS custom properties), data-/aria- attributes, boolean attributes (hidden, inert, open), tabIndex, img srcSet/sizes/loading, link target/rel, table colSpan/rowSpan, and SVG viewBox with camelCase attributes. One client counter.';
export const expectedBenefit = 'high';
// size = number of repeated groups.
export const sizes = {smoke: 3, full: 300};

export function Root({size}) {
  const groups = Array.from({length: size}, (_, i) => i);
  return (
    <Document title="Attributes, styles, ARIA">
      <main id="main">
        <h1 className="hero heading" id="top">
          Attributes, styles and ARIA
        </h1>
        <p
          className="styled"
          style={{
            marginTop: 8,
            padding: '4px 8px',
            fontSize: 14,
            '--x': '10px',
            '--accent': 'hsl(200, 50%, 50%)',
            color: 'var(--accent)',
            zIndex: 3,
            opacity: 0.5,
            borderLeftWidth: 2,
          }}
          data-kind="demo"
          data-index={0}
          aria-label="Demo paragraph"
          aria-level={2}
          hidden={false}
        >
          Inline style object with numeric values and custom properties.
        </p>
        {groups.map((i) => (
          <section key={i} className={'g-' + i} id={'group-' + i}>
            <div
              className={'box ' + (i % 2 ? 'odd' : 'even')}
              style={{
                width: 40 + i,
                height: 30 + i,
                lineHeight: 1.5,
                borderWidth: i % 5,
                '--depth': String(i),
                backgroundPosition: '0 0',
              }}
              data-pos={i}
              aria-describedby={'desc-' + i}
              tabIndex={i % 3 === 0 ? 0 : undefined}
            >
              Box {i}
            </div>
            <p id={'desc-' + i} aria-live="polite" aria-hidden={i % 4 === 0}>
              Description {i} <span aria-label={'star ' + i} role="img">★</span>
            </p>
            <div hidden={i % 5 === 0} inert={i % 7 === 0}>
              <details open={i % 2 === 0}>
                <summary>Details {i}</summary>
                <p>Hidden/inert/details body {i}.</p>
              </details>
            </div>
            <button
              type="button"
              className="act"
              tabIndex={(i % 3) - 1 === 0 ? undefined : 0}
              disabled={i % 11 === 0}
              aria-pressed={i % 2 === 0}
            >
              Act {i}
            </button>
            <img
              src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
              srcSet="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII= 1x, data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw== 2x"
              sizes="(max-width: 600px) 100vw, 50vw"
              loading={i % 2 === 0 ? 'lazy' : 'eager'}
              alt={'Alt ' + i}
              width={64 + i}
              height={48}
            />
            <a
              href={'/page-' + i}
              target={i % 3 === 0 ? '_blank' : undefined}
              rel={i % 3 === 0 ? 'noopener noreferrer' : undefined}
            >
              Link {i}
            </a>
            <table className="tbl">
              <tbody>
                <tr>
                  <td colSpan={i % 3 === 0 ? 2 : undefined}>R0C0-{i}</td>
                  <td rowSpan={i % 4 === 0 ? 2 : undefined}>R0C1-{i}</td>
                </tr>
                <tr>
                  <td>missing cells intentionally omitted</td>
                </tr>
              </tbody>
            </table>
            <svg width="40" height="40" viewBox={`0 0 ${40 + i} ${40 + i}`}>
              <circle
                cx="20"
                cy="20"
                r="10"
                strokeWidth={i % 3 + 1}
                clipPath="url(#clip-0)"
                strokeLinecap="round"
                fill={`hsl(${i * 5 % 360}, 50%, 50%)`}
              />
            </svg>
          </section>
        ))}
        <Counter />
      </main>
    </Document>
  );
}

export const interact = [
  {click: 'button.counter'},
  {expectText: {selector: 'button.counter', text: 'n: 1'}},
];
