import {unstable_pruneForBrowser} from 'react-server-dom-webpack/server';
import {makePage} from './PageApp';

export const PageAppBaseline = makePage(null);
export const PageAppHtmlFirst = makePage(unstable_pruneForBrowser);
