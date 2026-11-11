// Browser entry for scenarios: hydrates `document` from the inlined Flight data
// (self.__FLIGHT_DATA) like e2e/entry-client.js, and exposes __navigate.
import {use, startTransition, useEffect} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {
  createFromReadableStream,
  createFromFetch,
} from 'react-server-dom-webpack/client.browser';
import 'scenario-registry';

window.__webpack_chunk_load__ = () => Promise.resolve();

function Shell({response}) {
  const tree = use(response);
  useEffect(() => {
    if (window.__hydratedAt === undefined) window.__hydratedAt = performance.now();
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

const root = hydrateRoot(
  document,
  <Shell
    response={createFromReadableStream(flightStream, {
      // A boundary or the root client-rendered where static HTML was elided:
      // re-render from the full payload, like a navigation to the same URL.
      onElidedContentMissing() {
        const [, v, id] = location.pathname.split('/');
        window.__elidedRecoveries = (window.__elidedRecoveries || 0) + 1;
        root.render(<Shell response={createFromFetch(fetch('/' + v + '/rsc/' + id))} />);
      },
    })}
  />,
  {
    onRecoverableError(e) {
      (window.__recoverable ||= []).push(String(e && e.message));
    },
  }
);
window.__navigate = url =>
  new Promise(resolve => {
    startTransition(() => {
      root.render(<Shell response={createFromFetch(fetch(url))} />);
    });
    setTimeout(resolve, 0);
  });
