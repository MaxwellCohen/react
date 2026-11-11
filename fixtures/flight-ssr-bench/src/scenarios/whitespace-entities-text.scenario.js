import {Document} from './doc';
import Counter from './whitespace-entities-text.counter.client';

export const id = 'whitespace-entities-text';
export const title = 'Whitespace and entity text edge cases';
export const category = 'static';
export const description =
  'Text edge cases in pure server markup: leading/trailing/multiple spaces, newlines in <pre>, adjacent text expressions, empty strings, entities, raw JS-string special characters, emoji/CJK, and long unbroken words. One client counter.';
export const expectedBenefit = 'high';
// size = number of repeated groups.
export const sizes = {smoke: 3, full: 300};

function longWord(i) {
  let out = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let k = 0; k < 60; k++) {
    out += alphabet[(i * 7 + k * 3) % 26];
  }
  return out;
}

export function Root({size}) {
  const groups = Array.from({length: size}, (_, i) => i);
  return (
    <Document title="Whitespace and entities">
      <main id="main">
        <h1>Whitespace and entity edge cases</h1>
        <section>
          {'   leading spaces'}
          {'   '}
          {'trailing spaces   '}
        </section>
        <section>
          {'a'}{'b'}{1}{'c'}
        </section>
        <pre>
          {`line1
	line2 (tab)
    line3 (spaces)`}
        </pre>
        <section data-empty={''}>
          {' '}
          {''}
          {''}
          {'x'}
        </section>
        <section>{'&amp; &lt; &gt; &quot; &nbsp;'}</section>
        <section>
          {'<param> & "quotes" and \'apostrophes\''}
        </section>
        <section>{'emoji ✓ ünïcödé 日本語のテキスト 🚀🌍'}</section>
        <section>{'unbroken: ' + longWord(0)}</section>
        {groups.map((i) => (
          <div key={i} className="group">
            <p className={'pad-' + i} title={'  padded  ' + i + '  '}>
              {'  Group ' + i + '  '}{' '}{'with gaps'}{'  '}{'end  '}
            </p>
            <pre>
              {`pre ${i}:
  a  b   c
	line`}
            </pre>
            <p>
              {'adjacent'}{i}{'&'}{'<'}{'>'}{'"'}{'\''}{'—'}{' Dante © ' + i}
            </p>
            <p className="ents">
              {i % 2 === 0 ? 'entity set &amp;. &lt;. &gt;. &quot;pairs&quot;&#65292;&#65312;' : 'entity set &nbsp;… ‘quotes’ entity group'}
            </p>
            <p>{'\u00A0\u2028\u2029'}</p>
            <p>{'CJK ' + i + ' 中文 「quote」 『double』 and 🎉'.repeat(1)}</p>
            <p className="long">{longWord(i) + ' ' + longWord(i + 1)}</p>
            <p data-tail={i}>{'tail   '}</p>
          </div>
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
