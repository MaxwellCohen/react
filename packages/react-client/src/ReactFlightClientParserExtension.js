/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Lazily loaded extension for the Flight client (enableFlightLazyClientParser).
// It decodes the typed array rows so that code stays out of the initial load.

function mergeBuffer(
  buffer: Array<Uint8Array>,
  lastChunk: Uint8Array,
): Uint8Array {
  const l = buffer.length;
  let byteLength = lastChunk.length;
  for (let i = 0; i < l; i++) {
    byteLength += buffer[i].byteLength;
  }
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (let i = 0; i < l; i++) {
    const chunk = buffer[i];
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  result.set(lastChunk, offset);
  return result;
}

function toView(
  buffer: Array<Uint8Array>,
  lastChunk: Uint8Array,
  constructor: any,
  bytesPerElement: number,
): $ArrayBufferView {
  // Reuse the original buffer when the view fits in it and is aligned.
  const chunk =
    buffer.length === 0 && lastChunk.byteOffset % bytesPerElement === 0
      ? lastChunk
      : mergeBuffer(buffer, lastChunk);
  return new constructor(
    chunk.buffer,
    chunk.byteOffset,
    chunk.byteLength / bytesPerElement,
  );
}

export function decodeTypedArray(
  tag: number,
  buffer: Array<Uint8Array>,
  chunk: Uint8Array,
): $ArrayBufferView {
  switch (tag) {
    case 79 /* "O" */:
      return toView(buffer, chunk, Int8Array, 1);
    case 85 /* "U" */:
      return toView(buffer, chunk, Uint8ClampedArray, 1);
    case 83 /* "S" */:
      return toView(buffer, chunk, Int16Array, 2);
    case 115 /* "s" */:
      return toView(buffer, chunk, Uint16Array, 2);
    case 76 /* "L" */:
      return toView(buffer, chunk, Int32Array, 4);
    case 108 /* "l" */:
      return toView(buffer, chunk, Uint32Array, 4);
    case 71 /* "G" */:
      return toView(buffer, chunk, Float32Array, 4);
    case 103 /* "g" */:
      return toView(buffer, chunk, Float64Array, 8);
    case 77 /* "M" */:
      return toView(buffer, chunk, BigInt64Array, 8);
    case 109 /* "m" */:
      return toView(buffer, chunk, BigUint64Array, 8);
    default:
      /* "V" */ return toView(buffer, chunk, DataView, 1);
  }
}
