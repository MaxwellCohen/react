/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Thenable} from 'shared/ReactTypes';
import type {
  FlightTee,
  FlightTeeDispatcher,
  FlightTeeRow,
} from 'shared/ReactFlightTee';
import type {
  Response,
  StreamState,
  RowInitialization,
} from './ReactFlightClient';

import {FLIGHT_TEE_VERSION} from 'shared/ReactFlightTee';
import {enableFlightTee} from 'shared/ReactFeatureFlags';

import {
  createStreamState,
  getRoot,
  processWireRow,
  processWireText,
  processWireBinary,
  setReaderContext,
  beginRow,
  endRow,
  abortRow,
  beginElement,
  completeElement,
  decodeModelString,
  ELEMENT_FIELDS,
  close,
  reportGlobalError,
} from './ReactFlightClient';

// The client side of a tee (see shared/ReactFlightTee). It reads one Flight
// render into one Response.
type TeeInstance = {
  +_version: number,
  +_dispatcher: FlightTeeDispatcher,
  +_elementFields: Object,
  _response: Response,
  _streamState: StreamState,
  _connected: boolean,
  _read: boolean,
  // Hints and module preinits that arrived before the reader did.
  _readerTasks: null | Array<() => void>,
  // How many model rows were built by value, for tests.
  _rowsByValue: number,
};

function connect(flightTee: FlightTee): boolean {
  const tee: TeeInstance = flightTee as any;
  if (tee._connected) {
    return false;
  }
  tee._connected = true;
  return true;
}

function teeBeginRow(flightTee: FlightTee, id: number): null | FlightTeeRow {
  const tee: TeeInstance = flightTee as any;
  return beginRow(tee._response, tee._streamState, id);
}

function teeEndRow(
  flightTee: FlightTee,
  row: FlightTeeRow,
  value: mixed,
): void {
  const tee: TeeInstance = flightTee as any;
  tee._rowsByValue++;
  endRow(tee._response, row as any as RowInitialization, value);
}

function teeAbortRow(flightTee: FlightTee, row: FlightTeeRow): void {
  abortRow(row as any as RowInitialization);
}

function teeBeginElement(flightTee: FlightTee): void {
  beginElement();
}

function teeCompleteElement(
  flightTee: FlightTee,
  type: mixed,
  key: mixed,
  props: mixed,
  owner: mixed,
  stack: mixed,
  validated: number,
): mixed {
  const tee: TeeInstance = flightTee as any;
  return completeElement(
    tee._response,
    type,
    key,
    props,
    owner as any,
    stack as any,
    validated as any,
  );
}

function teeDecode(
  flightTee: FlightTee,
  parent: Object,
  key: string,
  value: string,
): mixed {
  const tee: TeeInstance = flightTee as any;
  return decodeModelString(tee._response, parent, key, value);
}

function teeProcessWireRow(flightTee: FlightTee, row: string): void {
  const tee: TeeInstance = flightTee as any;
  processWireRow(tee._response, tee._streamState, row);
}

function teeProcessWireText(
  flightTee: FlightTee,
  id: number,
  text: string,
): void {
  const tee: TeeInstance = flightTee as any;
  processWireText(tee._response, tee._streamState, id, text);
}

function teeProcessWireBinary(
  flightTee: FlightTee,
  id: number,
  tag: number,
  bytes: Uint8Array,
): void {
  const tee: TeeInstance = flightTee as any;
  processWireBinary(tee._response, tee._streamState, id, tag, bytes);
}

function teeClose(flightTee: FlightTee): void {
  const tee: TeeInstance = flightTee as any;
  close(tee._response);
}

function teeError(flightTee: FlightTee, error: mixed): void {
  const tee: TeeInstance = flightTee as any;
  reportGlobalError(tee._response, error as any);
}

// One dispatcher for every tee this build creates, so the server's calls stay
// monomorphic.
export const teeDispatcher: FlightTeeDispatcher = Object.freeze({
  c /* connect */: connect,
  b /* beginRow */: teeBeginRow,
  f /* endRow */: teeEndRow,
  a /* abortRow */: teeAbortRow,
  e /* beginElement */: teeBeginElement,
  m /* completeElement */: teeCompleteElement,
  d /* decode */: teeDecode,
  w /* processWireRow */: teeProcessWireRow,
  t /* processWireText */: teeProcessWireText,
  y /* processWireBinary */: teeProcessWireBinary,
  C /* close */: teeClose,
  X /* error */: teeError,
});

export function createTee(response: Response): FlightTee {
  if (!enableFlightTee) {
    throw new Error('createTee is not supported in this build of React.');
  }
  const readerTasks: Array<() => void> = [];
  const tee: TeeInstance = {
    _version: FLIGHT_TEE_VERSION,
    _dispatcher: teeDispatcher,
    _elementFields: ELEMENT_FIELDS,
    _response: response,
    // There's no stream to show as the I/O's value in DEV.
    _streamState: createStreamState(response, null),
    _connected: false,
    _read: false,
    _readerTasks: readerTasks,
    _rowsByValue: 0,
  };
  setReaderContext(response, task => {
    readerTasks.push(task);
  });
  return tee;
}

// Reads the tee's root. Call it after the tee has been passed to the server's
// render, from inside the reader's context: `runInReaderContext` runs a task
// there.
export function createFromTee<T>(
  flightTee: FlightTee,
  runInReaderContext: (task: () => void) => void,
): Thenable<T> {
  const tee: TeeInstance = flightTee as any;
  if (tee._read) {
    throw new Error(
      'A Flight tee can only be read once. Read any later copies from the stream.',
    );
  }
  if (!tee._connected) {
    throw new Error(
      'The tee has not been passed to a render. Pass it as the `tee` option ' +
        'of a Flight render before reading it.',
    );
  }
  tee._read = true;
  const readerTasks = tee._readerTasks;
  tee._readerTasks = null;
  setReaderContext(tee._response, runInReaderContext);
  if (readerTasks !== null) {
    for (let i = 0; i < readerTasks.length; i++) {
      runInReaderContext(readerTasks[i]);
    }
  }
  return getRoot(tee._response);
}
