import {
  patchDeclarativeBoundaries,
  revealDeclarativePatches,
} from './ReactDOMFizzInstructionSetShared';

// This is a string so Closure's advanced compilation mode doesn't mangle it.
/* eslint-disable dot-notation */
window['$RPQ'] = [];
window['$RW'] = revealDeclarativePatches;
window['$RP'] = patchDeclarativeBoundaries;
