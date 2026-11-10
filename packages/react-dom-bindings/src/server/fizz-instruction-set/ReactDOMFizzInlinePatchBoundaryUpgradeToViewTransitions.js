import {revealCompletedBoundariesWithViewTransitions} from './ReactDOMFizzInstructionSetShared';

// Upgrade the revealDeclarativePatches instruction to support ViewTransitions.
// This is a string so Closure's advanced compilation mode doesn't mangle it.
// eslint-disable-next-line dot-notation
window['$RW'] = revealCompletedBoundariesWithViewTransitions.bind(
  null,
  // eslint-disable-next-line dot-notation
  window['$RW'],
);
