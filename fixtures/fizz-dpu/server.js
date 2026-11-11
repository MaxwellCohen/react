'use strict';
// Test pages for <template for> out-of-order streaming. Needs a build:
//   node ./scripts/rollup/build.js react/index,react-dom/index,react-dom/src/server/react-dom-server.node,react-dom/unstable_server-external-runtime,scheduler --type=NODE_DEV,BROWSER_SCRIPT --releaseChannel=experimental
// Then: node fixtures/fizz-dpu/server.js   (http://localhost:3010)
const http = require('http');
const fs = require('fs');
const path = require('path');
const {Writable} = require('stream');
const build = path.join(__dirname, '../../build/node_modules');
const React = require(path.join(build, 'react'));
const {renderToPipeableStream} = require(path.join(build, 'react-dom/cjs/react-dom-server.node.development.js'));
const h = React.createElement;
const {Suspense} = React;
const ViewTransition = React.unstable_ViewTransition;

const cache = new Map();
function wait(key, ms) {
  let e = cache.get(key);
  if (!e) {
    e = {done: false};
    e.promise = new Promise(r => setTimeout(r, ms)).then(() => (e.done = true));
    cache.set(key, e);
  }
  if (!e.done) throw e.promise;
}
function Slow({id, ms, children}) {
  wait(id, ms);
  return h('div', {'data-done': id}, id, children);
}
function Boundary({id, ms, children}) {
  return h(
    Suspense,
    {fallback: h('span', {className: 'fb'}, 'loading ' + id)},
    h(Slow, {id, ms}, children),
  );
}

const scenarios = {
  basic: () => [
    ['a', h(Boundary, {id: 'a', ms: 100})],
    ['b', h(Boundary, {id: 'b', ms: 250})],
    ['c', h(Boundary, {id: 'c', ms: 400})],
  ],
  nested: () => [
    [
      'p',
      h(
        Suspense,
        {fallback: 'loading p'},
        h(Slow, {id: 'p', ms: 100}, h(Boundary, {id: 'child', ms: 300})),
      ),
    ],
    ['child', null],
  ],
  many: () =>
    Array.from({length: 100}, (_, i) => [
      'm' + i,
      h(Boundary, {id: 'm' + i, ms: 50 + (i % 10) * 40}),
    ]),
  svg: () => [
    [
      'svg',
      h(
        'svg',
        {width: 60, height: 30},
        h(
          Suspense,
          {fallback: h('rect', {width: 10, height: 10})},
          h(SvgSlow),
        ),
      ),
    ],
  ],
  style: () => [
    [
      'sty',
      h(
        Suspense,
        {fallback: 'loading sty'},
        h(Slow, {id: 'sty', ms: 150}, [
          h('style', {key: 's', href: 'dpu-s1', precedence: 'default'}, '.late{color:red}'),
          h('p', {key: 'p', className: 'late', id: 'late'}, 'late style'),
        ]),
      ),
    ],
  ],
  vt: () =>
    ViewTransition
      ? [
          [
            'vt',
            h(
              Suspense,
              {fallback: h(ViewTransition, null, h('p', null, 'loading vt'))},
              h(ViewTransition, null, h(Slow, {id: 'vt', ms: 200})),
            ),
          ],
        ]
      : [],
};
function SvgSlow() {
  wait('svg', 150);
  return h('circle', {cx: 10, cy: 10, r: 8, 'data-done': 'svg'});
}

const checker = `(${function () {
  function check() {
    var errors = [];
    if (document.querySelector('template[for]')) errors.push('unapplied template[for]');
    var it = document.createNodeIterator(document, 128), n;
    while ((n = it.nextNode())) {
      if (n.data === '$~') errors.push('boundary still pending: <!--' + n.data + '-->');
    }
    var want = document.body.getAttribute('data-expect').split(',').filter(Boolean);
    want.forEach(function (id) {
      if (!document.querySelector('[data-done="' + id + '"]')) errors.push('missing ' + id);
    });
    var svg = document.querySelector('svg circle[data-done]');
    if (want.indexOf('svg') >= 0 && (!svg || svg.namespaceURI !== 'http://www.w3.org/2000/svg')) errors.push('circle not in SVG namespace');
    var r = {ok: errors.length === 0, errors: errors};
    document.title = r.ok ? 'PASS' : 'FAIL';
    var el = document.getElementById('result');
    el.textContent = r.ok ? 'PASS' : 'FAIL: ' + errors.join('; ');
    el.className = r.ok ? 'pass' : 'fail';
    parent.postMessage(Object.assign({type: 'dpu'}, r), '*');
  }
  window.addEventListener('load', function () { setTimeout(check, 2500); });
}})()`;

function page(res, q) {
  const name = q.get('scenario') || 'basic';
  const external = q.get('external') === '1';
  const chunk = +q.get('chunk') || 0;
  const delay = +q.get('delay') || 0;
  const defs = (scenarios[name] || scenarios.basic)();
  cache.clear();
  const ids = [];
  const kids = defs.map(([id, node]) => {
    ids.push(id);
    return node;
  });
  if (name === 'nested') ids.splice(1);
  if (name === 'nested') ids.push('child');
  const app = h(
    'html',
    null,
    h(
      'head',
      null,
      h('title', null, 'dpu ' + name),
      h('style', {href: 'base', precedence: 'default'}, 'body{font:14px sans-serif}.pass{color:green}.fail{color:red}'),
    ),
    h(
      'body',
      {'data-expect': ids.join(',')},
      h('p', {id: 'result'}, 'running…'),
      ...kids.filter(Boolean).map((k, i) => h(React.Fragment, {key: i}, k)),
      h('script', {dangerouslySetInnerHTML: {__html: checker}}),
    ),
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.socket.setNoDelay(true);
  const out = new Writable({
    write(buf, _enc, cb) {
      if (!chunk) {
        res.write(buf);
        return cb();
      }
      let i = 0;
      (function next() {
        if (i >= buf.length) return cb();
        res.write(buf.subarray(i, i + chunk));
        i += chunk;
        setTimeout(next, delay || 1);
      })();
    },
    final(cb) {
      res.end();
      cb();
    },
  });
  const {pipe} = renderToPipeableStream(app, {
    unstable_declarativePatching: true,
    unstable_externalRuntimeSrc: external ? '/external-runtime.js' : undefined,
    onShellReady() {
      pipe(out);
    },
  });
}

const FUZZ = `<!doctype html><meta charset=utf-8><title>fuzz</title><body style="font:14px sans-serif">
<h3>Chunk-split fuzz</h3><button id=go>run</button><pre id=out></pre><iframe id=f style="width:300px;height:100px"></iframe>
<script>
var scenarios=['basic','nested','many','svg','style','vt'],chunks=[0,1,3,17,64,500],ext=[0,1],jobs=[];
scenarios.forEach(s=>ext.forEach(e=>chunks.forEach(c=>{ if(c===1&&s==='many')return; jobs.push({s,e,c}); })));
var out=document.getElementById('out'),f=document.getElementById('f'),fails=0;
function run(i){ if(i>=jobs.length){out.textContent+='\\nDONE '+(jobs.length-fails)+'/'+jobs.length+' passed';document.title=fails?'FUZZ FAIL':'FUZZ PASS';return;}
 var j=jobs[i],t=setTimeout(()=>{fails++;out.textContent+='TIMEOUT '+JSON.stringify(j)+'\\n';run(i+1)},60000);
 window.onmessage=function(m){ if(!m.data||m.data.type!=='dpu')return; clearTimeout(t);
  if(!m.data.ok)fails++; out.textContent+=(m.data.ok?'ok   ':'FAIL ')+JSON.stringify(j)+(m.data.ok?'':' '+m.data.errors.join('; '))+'\\n'; run(i+1);};
 f.src='/page?scenario='+j.s+'&external='+j.e+'&chunk='+j.c; }
document.getElementById('go').onclick=function(){run(0)};
</script>`;

const INDEX = () => {
  const links = Object.keys(scenarios)
    .map(
      s =>
        `<li>${s}: <a href="/page?scenario=${s}">inline</a> · <a href="/page?scenario=${s}&external=1">external</a> · <a href="/page?scenario=${s}&chunk=3">inline, 3-byte chunks</a> · <a href="/page?scenario=${s}&external=1&chunk=3">external, 3-byte chunks</a></li>`,
    )
    .join('');
  return `<!doctype html><meta charset=utf-8><title>dpu fixtures</title><body style="font:14px sans-serif"><h3>&lt;template for&gt; test pages</h3><ul>${links}</ul><a href="/fuzz">chunk-split fuzz</a>`;
};

http
  .createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/page') return page(res, u.searchParams);
    if (u.pathname === '/fuzz') return res.end(FUZZ);
    if (u.pathname === '/external-runtime.js') {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(fs.readFileSync(path.join(build, 'react-dom/unstable_server-external-runtime.js')));
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(INDEX());
  })
  .listen(+process.env.PORT || 3010, () => console.log("http://localhost:" + (process.env.PORT || 3010)));
