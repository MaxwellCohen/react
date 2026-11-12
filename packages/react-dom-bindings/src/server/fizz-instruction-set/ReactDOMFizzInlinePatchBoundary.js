import {
  flushDeclarativePatches,
  patchDeclarativeBoundaries,
  revealDeclarativePatches,
} from './ReactDOMFizzInstructionSetShared';

// This is a string so Closure's advanced compilation mode doesn't mangle it.
/* eslint-disable dot-notation */
window['$RPS'] = new Map();
window['$RPI'] = new WeakMap();
window['$RPQ'] = [];
window['$RW'] = revealDeclarativePatches;
window['$RPF'] = flushDeclarativePatches;
window['$RP'] = patchDeclarativeBoundaries;
