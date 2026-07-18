import { BinaryCursor } from "../../../core/binary/cursor";

export interface BinaryHeaderValues {
  readonly jobId: number;
  readonly lineNumber: number;
  readonly reelNumber: number;
  readonly tracesPerEnsemble: number;
  readonly sampleIntervalMicroseconds: number;
  readonly samplesPerTrace: number;
  readonly sampleFormatCode: number;
  readonly measurementSystem: number;
  readonly revisionRaw: number;
  readonly revision: 0 | 1 | 2;
  readonly fixedLengthTraceFlag: number;
  readonly extendedTextualHeaderCount: number;
}

/** Preserves all 400 binary-header bytes and exposes the standard Phase 1 fields. */
export class BinaryHeader {
  public readonly rawBytes: Uint8Array;
  public readonly values: BinaryHeaderValues;
  public readonly littleEndian: boolean;

  public constructor(raw: ArrayBuffer, littleEndian: boolean) {
    if (raw.byteLength !== 400) throw new RangeError("A SEG-Y binary header is exactly 400 bytes.");
    this.rawBytes = new Uint8Array(raw.slice(0));
    this.littleEndian = littleEndian;
    const cursor = new BinaryCursor(raw, littleEndian, 3200);
    const revisionRaw = cursor.uint16(300);
    const major = revisionRaw >>> 8;
    this.values = {
      jobId: cursor.int32(0), lineNumber: cursor.int32(4), reelNumber: cursor.int32(8),
      tracesPerEnsemble: cursor.uint16(12), sampleIntervalMicroseconds: cursor.uint16(16), samplesPerTrace: cursor.uint16(20),
      sampleFormatCode: cursor.uint16(24), measurementSystem: cursor.uint16(54), revisionRaw,
      revision: major === 2 ? 2 : major === 1 ? 1 : 0,
      fixedLengthTraceFlag: cursor.uint16(302), extendedTextualHeaderCount: cursor.int16(304)
    };
  }

  public withUint16(offset: number, value: number): BinaryHeader {
    if (!Number.isInteger(offset) || offset < 0 || offset + 2 > this.rawBytes.byteLength || !Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError("Binary-header uint16 edit is outside the header or representable range.");
    const next = this.rawBytes.slice();
    new DataView(next.buffer).setUint16(offset, value, this.littleEndian);
    return new BinaryHeader(next.buffer, this.littleEndian);
  }
}
