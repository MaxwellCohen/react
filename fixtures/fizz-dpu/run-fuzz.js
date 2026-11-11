'use strict';
// node fixtures/fizz-dpu/run-fuzz.js [port] : runs /fuzz in headless Chromium.
const {chromium} = require('playwright');
(async () => {
  const port = process.argv[2] || 3010;
  const browser = await chromium.launch({channel: 'chrome'});
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/fuzz`);
  await page.click('#go');
  await page.waitForFunction(() => /^FUZZ/.test(document.title), null, {timeout: 600000});
  const text = await page.textContent('#out');
  console.log(text.split('\n').filter(l => !l.startsWith('ok')).join('\n'));
  await browser.close();
})();
