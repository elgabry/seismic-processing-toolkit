/** Constants derived from the SmartSolo SEG-D 8058 layout used by the preserved v2.2 viewer. */
export const SmartSolo8058 = {
  blockBytes: 32,
  formatCodeOffset: 2,
  formatCodeHigh: 0x80,
  formatCodeLow: 0x58,
  additionalGeneralHeadersOffset: 11,
  baseScanOffset: 22,
  gatherTypeOffset: 23,
  channelSetCountOffset: 28,
  skewBlockCountOffset: 29,
  extendedHeaderBlocksOffset: 30,
  externalHeaderBlocksOffset: 31,
  generalHeaderTwoOffset: 32,
  generalHeaderThreeOffset: 64,
  revisionMajorOffset: 10,
  revisionMinorOffset: 11,
  sourceLineOffset: 3,
  sourcePointOffset: 8,
  traceHeaderBytes: 244,
  traceDemuxHeaderBytes: 20,
  traceExtensionBytes: 224,
  sampleBytes: 4,
  indexingWindowBytes: 64 * 1024,
  maximumHeaderBlocks: 128
} as const;

export const SmartSoloTraceOffsets = {
  traceNumberBcd: 4,
  extensionOne: 20,
  extensionTwo: 52,
  extensionThree: 84,
  extensionFour: 116,
  extensionSix: 180,
  sampleCountInExtensionOne: 27,
  traceNumberInExtensionTwo: 80,
  fieldRecordInExtensionTwo: 62,
  receiverEasting: 84,
  receiverNorthing: 88,
  receiverElevation: 92,
  sourceEasting: 96,
  sourceNorthing: 100,
  sourceElevation: 104,
  receiverLatitudeInteger: 116,
  receiverLatitudeFraction: 120,
  receiverLongitudeInteger: 122,
  receiverLongitudeFraction: 126,
  receiverSerial: 181,
  channelNumber: 185
} as const;

export function isBcdByte(value: number): boolean { return (value >>> 4) <= 9 && (value & 0x0f) <= 9; }

export function decodeBcd(bytes: Uint8Array, offset: number, count: number): number | undefined {
  if (!Number.isInteger(offset) || !Number.isInteger(count) || offset < 0 || count < 1 || offset + count > bytes.length) return undefined;
  let value = 0;
  for (let index = 0; index < count; index += 1) {
    const byte = bytes[offset + index] ?? 0;
    if (!isBcdByte(byte)) return undefined;
    value = value * 100 + (byte >>> 4) * 10 + (byte & 0x0f);
  }
  return value;
}

export function decodeUint24(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 3 > bytes.length) return undefined;
  return ((bytes[offset] ?? 0) << 16) | ((bytes[offset + 1] ?? 0) << 8) | (bytes[offset + 2] ?? 0);
}

/** SmartSolo stores GPS as signed DDMMSS plus an unsigned 1/65535-second fraction. */
export function decodeDms(integer: number, fraction: number): number {
  if (integer === 0 && fraction === 0) return 0;
  const sign = integer < 0 ? -1 : 1;
  const absolute = Math.abs(integer);
  const degrees = Math.floor(absolute / 10_000);
  const minutes = Math.floor((absolute % 10_000) / 100);
  const seconds = absolute % 100 + fraction / 65_535;
  return sign * (degrees + minutes / 60 + seconds / 3600);
}
