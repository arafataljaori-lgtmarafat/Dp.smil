const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Reads dimensions directly from an encoded JPEG SOF segment without decoding source pixels into JS memory. */
export function decodeEncodedJpegDimensions(bytes: Uint8Array): { readonly width: number; readonly height: number } {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Composition encoder did not produce a JPEG file.');
  let offset = 2;
  while (offset + 8 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    let markerOffset = offset + 1;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset += 1;
    const marker = bytes[markerOffset];
    if (marker === undefined) break;
    offset = markerOffset + 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const lengthHigh = bytes[offset];
    const lengthLow = bytes[offset + 1];
    if (lengthHigh === undefined || lengthLow === undefined) break;
    const segmentLength = lengthHigh * 256 + lengthLow;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker)) {
      const heightHigh = bytes[offset + 3];
      const heightLow = bytes[offset + 4];
      const widthHigh = bytes[offset + 5];
      const widthLow = bytes[offset + 6];
      if (heightHigh === undefined || heightLow === undefined || widthHigh === undefined || widthLow === undefined) break;
      const height = heightHigh * 256 + heightLow;
      const width = widthHigh * 256 + widthLow;
      if (width <= 0 || height <= 0) break;
      return { width, height };
    }
    offset += segmentLength;
  }
  throw new Error('Composition JPEG dimensions could not be decoded.');
}

export function assertEncodedJpegDimensions(bytes: Uint8Array, expected: { readonly width: number; readonly height: number }): void {
  const actual = decodeEncodedJpegDimensions(bytes);
  if (actual.width !== expected.width || actual.height !== expected.height) throw new Error(`Composition JPEG dimensions ${actual.width}×${actual.height} do not match target ${expected.width}×${expected.height}.`);
}
