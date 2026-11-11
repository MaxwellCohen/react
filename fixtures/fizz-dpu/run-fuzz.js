'use strict';
// node fixtures/fizz-dpu/run-fuzz.js [port] [chrome|firefox|webkit]
// Loads every scenario as a top-level page (iframes get throttled rAF in WebKit) split
// into several chunk sizes, inline and external runtime. PLAYWRIGHT_MODULE=/path/to/
// playwright-core uses another Playwright install.
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const scenarios = ['basic', 'nested', 'many', 'svg', 'style', 'vt'];
const chunks = [0, 1, 3, 17, 64, 500];
(async () => {
  const port = process.argv[2] || 3010;
  const name = process.argv[3] || 'chrome';
  const browser =
    name === 'chrome'
      ? await pw.chromium.launch({channel: 'chrome'})
      : await pw[name].launch();
  console.log(name, browser.version());
  let total = 0;
  let failed = 0;
  for (const s of scenarios) {
    for (const e of [0, 1]) {
      for (const c of chunks) {
        if (c === 1 && s === 'many') continue;
        total++;
        const page = await browser.newPage();
        await page.goto(`http://localhost:${port}/page?scenario=${s}&external=${e}&chunk=${c}`);
        let result;
        try {
          await page.waitForFunction(() => /^(PASS|FAIL)/.test(document.title), null, {timeout: 120000});
          result = await page.textContent('#result');
        } catch (err) {
          result = 'TIMEOUT';
        }
        if (result !== 'PASS') {
          failed++;
          console.log(`FAIL ${s} external=${e} chunk=${c}: ${String(result).slice(0, 200)}`);
        }
        await page.close();
      }
    }
  }
  console.log(`DONE ${total - failed}/${total} passed`);
  await browser.close();
})();
