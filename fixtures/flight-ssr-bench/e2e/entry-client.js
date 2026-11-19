// Browser entry for the e2e: hydrates the document from the inlined Flight
// data (self.__FLIGHT_DATA), the way a framework's client bootstrap does.
import {use, startTransition, useEffect} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {
  createFromReadableStream,
  createFromFetch,
} from 'react-server-dom-webpack/client.browser';
// Pulls the client components into the bundle under their `named` module ids.
import './registry';

window.__webpack_chunk_load__ = () => Promise.resolve();

function Shell({response}) {
  const tree = use(response);
  // First commit with real content = hydrated (ms since navigation start).
  useEffect(() => {
    if (window.__hydratedAt === undefined) {
      window.__hydratedAt = performance.now();
    }
  }, []);
  return tree;
}

const encoder = new TextEncoder();
const flightStream = new ReadableStream({
  start(controller) {
    const push = chunk => controller.enqueue(encoder.encode(chunk));
    (self.__FLIGHT_DATA || []).forEach(push);
    self.__FLIGHT_DATA = {push};
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => controller.close());
    } else {
      controller.close();
    }
  },
});

const t0 = performance.now();
const root = hydrateRoot(
  document,
  <Shell response={createFromReadableStream(flightStream)} />,
  {
    onRecoverableError(e) {
      (window.__recoverable ||= []).push(String(e && e.message));
    },
  }
);
window.__hydrateStart = t0;
window.__navigate = url =>
  new Promise(resolve => {
    startTransition(() => {
      root.render(<Shell response={createFromFetch(fetch(url))} />);
    });
    setTimeout(resolve, 0);
  });
