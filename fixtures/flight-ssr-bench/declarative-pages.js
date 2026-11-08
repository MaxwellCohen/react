'use strict';

// Isomorphic test pages for declarative patching (unstable_declarativePatching).
// Shared by declarative-server.js (SSR) and declarative-client.js (hydration).
// `React` is injected so the server and the client bundle each use exactly one
// React instance. On the server, <Delay> suspends for `ms`; on the client it
// renders synchronously so hydration never waits for data.

// Injected into <head> before anything else. Records every parser-created
// ProcessingInstruction/comment marker, <template for> and id'd element so the
// browser run can verify what the real DOM looks like. No React runtime here.
const PROBE = `
(function () {
  var log = (window.__log = []);
  window.__first = {};
  function t() { return Math.round(performance.now()); }
  function describe(n) {
    if (n.nodeType === 7) return {kind: 'pi', nodeType: 7, nodeName: n.nodeName, target: n.target, data: n.data};
    if (n.nodeType === 8) return {kind: 'comment', nodeType: 8, data: n.data};
    if (n.nodeType === 1 && n.nodeName === 'TEMPLATE' && n.hasAttribute('for')) return {kind: 'template-for', id: n.getAttribute('for')};
    if (n.nodeType === 1 && n.id) return {kind: 'element', id: n.id};
    return null;
  }
  function visit(n, ev) {
    if (n.nodeType === 1 && ev === 'added' && n.id && !window.__first[n.id]) window.__first[n.id] = n;
    var d = describe(n);
    if (d && (d.kind !== 'comment' || /^[?$]|^\\/\\$/.test(d.data))) { d.ev = ev; d.t = t(); log.push(d); }
    if (n.nodeType === 1 || n.nodeType === 11) {
      for (var c = n.firstChild; c; c = c.nextSibling) visit(c, ev);
    }
  }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) { visit(n, 'added'); });
      m.removedNodes.forEach(function (n) { visit(n, 'removed'); });
    });
  }).observe(document, {childList: true, subtree: true});
  // Paint metrics.
  window.__paint = {};
  try {
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (e) { window.__paint[e.name] = Math.round(e.startTime); });
    }).observe({type: 'paint', buffered: true});
    new PerformanceObserver(function (l) {
      var es = l.getEntries(); var e = es[es.length - 1];
      window.__paint.lcp = Math.round(e.startTime); window.__paint.lcpId = e.id || e.element && e.element.tagName;
    }).observe({type: 'largest-contentful-paint', buffered: true});
  } catch (e) {}
  // rAF gaps: rendering is suppressed while render-blocking links load.
  window.__raf = {last: 0, maxGap: 0, maxGapAt: 0, frames: 0};
  (function tick(ts) {
    var r = window.__raf;
    if (r.last && ts - r.last > r.maxGap) { r.maxGap = Math.round(ts - r.last); r.maxGapAt = Math.round(r.last); }
    r.last = ts; r.frames++; requestAnimationFrame(tick);
  })(0);
  // Reveal cadence: how many separate DOM updates removed fallbacks, and in how many
  // distinct animation frames (what the user can actually see as separate reveals).
  window.__rev = {calls: 0, removed: 0, frames: 0, first: 0, last: 0};
  var revPending = false;
  new MutationObserver(function (muts) {
    var n = 0;
    muts.forEach(function (m) {
      m.removedNodes.forEach(function (x) {
        if (x.nodeType === 1 && x.classList.contains('fb')) n++;
      });
    });
    if (n) {
      var r = window.__rev;
      r.calls++; r.removed += n; r.last = t(); if (!r.first) r.first = r.last;
      revPending = true;
    }
  }).observe(document, {childList: true, subtree: true});
  (function revTick() {
    requestAnimationFrame(function () {
      if (revPending) { window.__rev.frames++; revPending = false; }
      revTick();
    });
  })();
  // When does the fallback go away, and is #styled already styled at that point?
  window.__fbGone = null;
  new MutationObserver(function () {
    var fb = document.getElementById('fb-css') || document.getElementById('fb-style');
    var el = document.getElementById('styled');
    if (!fb && el && !window.__fbGone) {
      window.__fbGone = {t: t(), bg: getComputedStyle(el).backgroundColor};
    }
  }).observe(document, {childList: true, subtree: true});
  // First rAF after #styled shows up: is the stylesheet applied already?
  window.__styled = null;
  new MutationObserver(function () {
    var el = document.getElementById('styled');
    if (el && !window.__styled) {
      window.__styled = {insertedAt: t()};
      requestAnimationFrame(function () {
        window.__styled.firstFrameAt = t();
        window.__styled.bg = getComputedStyle(el).backgroundColor;
      });
    }
  }).observe(document, {childList: true, subtree: true});
})();
`;

module.exports = function createPages(React, ctx) {
  const {Suspense, useState, use} = React;
  const h = React.createElement;
  const isServer = typeof window === 'undefined';
  const cache = (ctx && ctx.cache) || new Map();

  function Delay({id, ms, children}) {
    if (isServer && ms > 0) {
      let p = cache.get(id);
      if (!p) {
        p = new Promise(resolve => setTimeout(resolve, ms));
        cache.set(id, p);
      }
      use(p);
    }
    return children;
  }

  function Counter({id}) {
    const [n, setN] = useState(0);
    return h(
      'button',
      {id: 'btn-' + id, onClick: () => setN(n + 1)},
      id + ':' + n
    );
  }

  const fallback = id =>
    h('p', {className: 'fb', id: 'fb-' + id}, 'Loading ' + id);

  function Basic() {
    return [
      h('h1', {key: 'h'}, 'Basic'),
      h(
        Suspense,
        {key: 'a', fallback: fallback('a')},
        h(
          Delay,
          {id: 'a', ms: 300},
          h('div', {id: 'content-a'}, 'Content A ', h(Counter, {id: 'a'}))
        )
      ),
      h(
        Suspense,
        {key: 'b', fallback: fallback('b')},
        h(
          Delay,
          {id: 'b', ms: 700},
          h('div', {id: 'content-b'}, 'Content B ', h(Counter, {id: 'b'}))
        )
      ),
    ];
  }

  function Nested() {
    return [
      h('h1', {key: 'h'}, 'Nested'),
      h(
        Suspense,
        {key: 'o', fallback: fallback('outer')},
        h(
          Delay,
          {id: 'outer', ms: 300},
          h(
            'div',
            {id: 'content-outer'},
            'Outer ',
            h(Counter, {id: 'outer'}),
            h(
              Suspense,
              {fallback: fallback('inner1')},
              h(
                Delay,
                {id: 'inner1', ms: 800},
                h(
                  'div',
                  {id: 'content-inner1'},
                  'Inner1 ',
                  h(Counter, {id: 'inner1'})
                )
              )
            ),
            h(
              Suspense,
              {fallback: fallback('inner2')},
              h(
                Delay,
                {id: 'inner2', ms: 1100},
                h(
                  'div',
                  {id: 'content-inner2'},
                  'Inner2 ',
                  h(Counter, {id: 'inner2'}),
                  h(
                    Suspense,
                    {fallback: fallback('deep')},
                    h(
                      Delay,
                      {id: 'deep', ms: 1500},
                      h(
                        'div',
                        {id: 'content-deep'},
                        'Deep ',
                        h(Counter, {id: 'deep'})
                      )
                    )
                  )
                )
              )
            )
          )
        )
      ),
    ];
  }

  function Css() {
    const cssMs = (ctx && ctx.cssMs) || 900;
    return [
      h('h1', {key: 'h'}, 'Stylesheet gated'),
      h(
        Suspense,
        {key: 'c', fallback: fallback('css')},
        h(
          Delay,
          {id: 'css', ms: 300},
          h(
            'div',
            {id: 'content-css'},
            h('link', {
              rel: 'stylesheet',
              href: '/slow.css?ms=' + cssMs,
              precedence: 'default',
            }),
            h(
              'div',
              {id: 'styled', className: 'styled'},
              'Styled ',
              h(Counter, {id: 'css'})
            )
          )
        )
      ),
    ];
  }

  function Heavy() {
    const n = (ctx && ctx.boundaries) || 300;
    const items = [h('h1', {key: 'h'}, 'Heavy')];
    for (let i = 0; i < n; i++) {
      const id = 'i' + i;
      items.push(
        h(
          Suspense,
          {key: id, fallback: h('div', {className: 'card fb'}, 'Loading ' + i)},
          h(
            Delay,
            {id, ms: 50 + (i % 20) * 25},
            h(
              'div',
              {className: 'card', id: 'content-' + id},
              h('h3', null, 'Item ' + i),
              h(
                'p',
                null,
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit ' + i
              ),
              h(Counter, {id})
            )
          )
        )
      );
    }
    return items;
  }

  function Style() {
    return [
      h('h1', {key: 'h'}, 'Late style'),
      h(
        Suspense,
        {key: 's', fallback: fallback('style')},
        h(
          Delay,
          {id: 'style', ms: 300},
          h(
            'div',
            {id: 'content-style'},
            h(
              'style',
              {href: 'late-1', precedence: 'default'},
              '.sty{display:block;background-color:rgb(0,0,255);padding:40px}'
            ),
            h(
              'div',
              {id: 'styled', className: 'sty'},
              'Late style ',
              h(Counter, {id: 'style'})
            )
          )
        )
      ),
    ];
  }

  // SuspenseList with staggered, out of order delays (needs the experimental build).
  function List() {
    const order = (ctx && ctx.order) || 'forwards';
    const delays = [700, 200, 500, 100, 600, 300];
    const SuspenseList = React.unstable_SuspenseList;
    return [
      h('h1', {key: 'h'}, 'List ' + order),
      h(
        SuspenseList,
        {key: 'l', revealOrder: order},
        delays.map((ms, i) =>
          h(
            Suspense,
            {
              key: i,
              fallback: h('div', {className: 'card fb'}, 'Loading ' + i),
            },
            h(
              Delay,
              {id: 'l' + i, ms},
              h(
                'div',
                {className: 'card', id: 'content-l' + i},
                'Item ' + i,
                h(Counter, {id: 'l' + i})
              )
            )
          )
        )
      ),
    ];
  }

  function Boom() {
    // Throws on the server only, so the client can recover by client rendering.
    if (isServer) {
      throw new Error('boom from the server');
    }
    return h(
      'div',
      {id: 'content-error'},
      'Client rendered ',
      h(Counter, {id: 'error'})
    );
  }

  // The boundary errors on the server after a delay; React client renders it.
  function ErrorPage() {
    return [
      h('h1', {key: 'h'}, 'Server error'),
      h(
        Suspense,
        {key: 'e', fallback: fallback('error')},
        h(Delay, {id: 'error', ms: 300}, h(Boom))
      ),
      // A slow sibling keeps the document loading, like any real page would.
      h(
        Suspense,
        {key: 's', fallback: fallback('slow')},
        h(
          Delay,
          {id: 'slow', ms: 1500},
          h('p', {id: 'content-slow'}, 'slow content')
        )
      ),
    ];
  }

  const PAGES = {
    error: ErrorPage,
    basic: Basic,
    nested: Nested,
    css: Css,
    style: Style,
    heavy: Heavy,
    list: List,
  };

  function App({page}) {
    const Page = PAGES[page] || Basic;
    return h(
      'html',
      {lang: 'en'},
      h(
        'head',
        null,
        h('meta', {charSet: 'utf-8'}),
        h('script', {dangerouslySetInnerHTML: {__html: PROBE}}),
        h('title', null, 'declarative ' + page)
      ),
      h('body', null, h(Page))
    );
  }

  return {App};
};
