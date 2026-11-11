import {Document} from './doc';

export const id = 'i18n-text-heavy';
export const title = 'Long multilingual text';
export const category = 'static';
export const description =
  'Many paragraphs of CJK, Arabic (RTL), emoji, accented Latin and characters that must be escaped (& < > "), with HTML entities in literal text.';
export const expectedBenefit = 'high';
// size = number of paragraphs.
export const sizes = {smoke: 20, full: 500};

const SAMPLES = [
  {lang: 'zh-Hans', dir: 'ltr', text: '这是一个关于服务器渲染与流式传输的段落，用于测试多字节字符的处理。'},
  {lang: 'ja', dir: 'ltr', text: 'ストリーミングされたデータは、クライアントで段階的に復元されます。日本語の文章です。'},
  {lang: 'ko', dir: 'ltr', text: '서버 컴포넌트는 HTML과 함께 직렬화된 데이터를 전송합니다.'},
  {lang: 'ar', dir: 'rtl', text: 'هذه فقرة باللغة العربية تُعرض من اليمين إلى اليسار لاختبار الاتجاه.'},
  {lang: 'he', dir: 'rtl', text: 'זוהי פסקה בעברית לבדיקת כיווניות הטקסט בעמוד.'},
  {lang: 'fr', dir: 'ltr', text: 'Élève à l’école, déjà prêt : crème brûlée, façade, naïve, œuvre, Ångström.'},
  {lang: 'de', dir: 'ltr', text: 'Größe, Straße, Übermaß, Äpfel und Öl — mit „typografischen“ Anführungszeichen.'},
  {lang: 'es', dir: 'ltr', text: 'Ñandú, niño, pingüino y ¿qué tal? ¡Muy bien!'},
  {lang: 'en', dir: 'ltr', text: 'Tom & Jerry say <b>hi</b> and "quote" each other 3 > 2 < 5 & 1 < 2.'},
  {lang: 'en', dir: 'ltr', text: 'Emoji test: 🚀 🧪 👩🏽‍💻 🇯🇵 ✅ — mixed with text 🎉.'},
  {lang: 'hi', dir: 'ltr', text: 'यह हिंदी में एक परीक्षण अनुच्छेद है, जिसमें देवनागरी लिपि के संयुक्ताक्षर शामिल हैं।'},
  {lang: 'ru', dir: 'ltr', text: 'Это абзац на русском языке для проверки кодировки кириллицы.'},
];

function Para({i}) {
  const s = SAMPLES[i % SAMPLES.length];
  return (
    <p className="para" lang={s.lang} dir={s.dir}>
      <span className="idx">[{i}]</span> {s.text}
    </p>
  );
}

export function Root({size}) {
  const paras = [];
  for (let i = 0; i < size; i++) paras.push(<Para key={i} i={i} />);
  return (
    <Document title="Multilingual text">
      <main>
        <h1>Global content &amp; localization</h1>
        <p>
          Literal entities: &amp; &lt;tag&gt; &quot;double&quot; &apos;single&apos; &copy; 2026 &mdash; &hellip;
        </p>
        {paras}
      </main>
    </Document>
  );
}

export const interact = [
  {expectText: {selector: 'h1', text: 'Global content & localization'}},
  {expectCount: {selector: 'p.para', count: 'size'}},
];
