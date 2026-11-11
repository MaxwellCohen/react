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

export function renderRSCEdge(clientManifest, Component, itemCount, options) {
  return renderToReadableStream(
    <Component itemCount={itemCount} />,
    clientManifest,
    options
  );
}

export {App, AppAsync};

export {default as TableServer} from './TableServer';
export {default as TableServerHost} from './TableServerHost';
export {
  PageStyle,
  PageJsonLd,
  TableServerLean,
  PageMixed,
  TableServerStatic,
  TableServerStaticBody,
} from './Pages';
export {PageAppBaseline, PageAppHtmlFirst} from './PageAppRsc';
