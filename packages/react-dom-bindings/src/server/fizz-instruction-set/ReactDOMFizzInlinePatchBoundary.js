import {
  patchDeclarativeBoundaries,
  revealCompletedBoundaries,
} from './ReactDOMFizzInstructionSetShared';

// The reveal is shared with the script path: $RP queues on $RB what $RC would.
// This is a string so Closure's advanced compilation mode doesn't mangle it.
/* eslint-disable dot-notation */
window['$RB'] = [];
window['$RV'] = revealCompletedBoundaries;
window['$RP'] = patchDeclarativeBoundaries;
