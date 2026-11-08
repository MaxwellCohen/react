import {
  renderToPipeableStream,
  renderToReadableStream,
} from 'react-server-dom-webpack/server';
import App from './App';
import AppAsync from './AppAsync';

export function renderRSCNode(clientManifest, Component, itemCount, options) {
  return renderToPipeableStream(
    <Component itemCount={itemCount} />,
    clientManifest,
    options
  );
}

export function renderRSCEdge(clientManifest, Component, itemCount) {
  return renderToReadableStream(
    <Component itemCount={itemCount} />,
    clientManifest
  );
}

export {App, AppAsync};

export {default as TableServer} from './TableServer';
export {default as TableServerHost} from './TableServerHost';
