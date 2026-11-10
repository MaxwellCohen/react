'use strict';

// Correctness matrix: every scenario x build variant, rendered in-process
// (Flight -> Fizz with the HTML-FIRST.md opt-in), hydrated in a real browser.
// Usage: SCENARIO_BUILDS=<dir> node scenarios-check.js [--only a,b] [--size smoke|full] [--builds dir] [--browser chromium|firefox|webkit]
const {parseArgs} = require('./scenarios-lib/common');
const {boot} = require('./scenarios-lib/boot');
const {serve, runPage, firstDiff, launchBrowser} = require('./scenarios-lib/browser');

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = await boot(opts, {client: true});
  const pages = {};
  const flights = {};
  const results = []; // {scenario, variant, failures}
  const refs = {}; // scenario -> off snapshots
  const server = await serve(pages, flights, Object.fromEntries(ctx.workers.map(w => [w.name, ctx.dirs[w.name]])));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await launchBrowser(opts.browser);
  const browserVersion = browser.version();
  try {
    for (const s of ctx.scenarios) {
      for (const w of ctx.workers) {
        const failures = [];
        const key = w.name + '/' + s.id;
        let snaps = {};
        try {
          const r = await w.call('render', {id: s.id, size: s.size, recoverErrors: s.allowRecoverableErrors});
          for (const p of r.problems.filter(p => !(s.allowRecoverableErrors && /Fizz Node error/.test(p)))) failures.push({check: 'console', message: '[server render] ' + p});
          if (!r.html.includes('</body></html>')) failures.push({check: 'render', message: 'HTML does not end with </body></html>'});
          pages[key] = r.html;
          const f = await w.call('flight', {id: s.id, size: s.size});
          for (const p of f.problems) failures.push({check: 'console', message: '[server flight] ' + p});
          flights[key] = f.flight;
          const out = await runPage(browser, base, w.name, s);
          snaps = out.snaps;
          if (process.env.SCN_DUMP) require('fs').writeFileSync(process.env.SCN_DUMP + '-' + key.replace('/', '_') + '.json', JSON.stringify({html: r.html.slice(0, 3000), snaps}, null, 1));
          failures.push(...out.failures);
          if (w.name === 'off') refs[s.id] = snaps;
          else if (refs[s.id]) {
            for (const k of ['hydrated', 'interacted']) {
              const ref = refs[s.id][k];
              if (ref !== undefined && snaps[k] !== undefined && ref !== snaps[k]) {
                failures.push({check: 'dom-vs-off', message: k + ' DOM differs from flags-off DOM: ' + firstDiff(ref, snaps[k])});
              }
            }
          }
        } catch (e) {
          failures.push({check: 'harness', message: String((e && e.stack) || e).split('\n').slice(0, 6).join('\n')});
        }
        results.push({scenario: s, variant: w.name, failures});
        process.stdout.write(failures.length ? 'F' : '.');
      }
    }
  } finally {
    await browser.close();
    server.close();
    ctx.kill();
  }
  console.log('\n');
  let unexpected = 0;
  for (const s of ctx.scenarios) {
    const rs = results.filter(r => r.scenario === s);
    const kf = s.knownFailure;
    const lines = [];
    let status = 'PASS';
    for (const r of rs) {
      const expected = kf && (!kf.variants || kf.variants.includes(r.variant));
      if (r.failures.length && !expected) {
        status = 'FAIL';
        unexpected++;
        lines.push('  [' + r.variant + '] FAIL');
        for (const f of r.failures) lines.push('    (' + f.check + ') ' + f.message);
      } else if (r.failures.length) {
        if (status === 'PASS') status = 'EXPECTED-FAILURE';
        lines.push('  [' + r.variant + '] expected failure (knownFailure): ' + r.failures.map(f => '(' + f.check + ') ' + f.message.split('\n')[0]).join(' | '));
      } else if (expected) {
        status = 'FAIL';
        unexpected++;
        lines.push('  [' + r.variant + '] UNEXPECTED PASS: remove `knownFailure` for this variant from the scenario');
      }
    }
    console.log((status === 'PASS' ? 'PASS' : status) + '  ' + s.id + '  (' + rs.map(r => r.variant + (r.failures.length ? ':x' : ':ok')).join(' ') + ')');
    for (const l of lines) console.log(l);
  }
  console.log('\n' + ctx.scenarios.length + ' scenario(s) x ' + ctx.workers.length + ' variant(s), size=' + opts.size + ', DOM env: real ' + opts.browser + ' ' + browserVersion + ' (playwright), builds=' + opts.builds);
  process.exit(unexpected ? 1 : 0);
})().catch(e => {
  console.error(process.env.DEBUG ? e : e.message);
  process.exit(1);
});
