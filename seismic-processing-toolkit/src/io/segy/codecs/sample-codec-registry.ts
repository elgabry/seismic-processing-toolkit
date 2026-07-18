import { UnsupportedSampleFormatError } from "../../../core/errors/errors";
import { ibm32ToNumber, numberToIbm32 } from "./ibm-float";
import type { SampleCodec } from "./sample-codec";

function finite(value: number): number { return Number.isFinite(value) ? value : 0; }
function bigintSample(value: bigint): number { const limit = BigInt(Number.MAX_SAFE_INTEGER); if (value > limit || value < -limit) throw new RangeError("SEG-Y 64-bit integer sample cannot be represented safely as a JavaScript number."); return Number(value); }

function requireCodecRange(view: DataView, byteOffset: number, sampleCount: number, bytesPerSample: number, destinationLength: number, destinationOffset: number): void {
  if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(sampleCount) || !Number.isSafeInteger(destinationOffset) || byteOffset < 0 || sampleCount < 0 || destinationOffset < 0) throw new RangeError("Sample codec offsets and counts must be non-negative safe integers.");
  const byteLength = sampleCount * bytesPerSample;
  if (!Number.isSafeInteger(byteLength) || byteOffset + byteLength > view.byteLength || destinationOffset + sampleCount > destinationLength) throw new RangeError("Sample codec source or destination range is outside its supplied buffer.");
}

function signed24(view: DataView, offset: number, littleEndian: boolean): number {
  const a = view.getUint8(offset);
  const b = view.getUint8(offset + 1);
  const c = view.getUint8(offset + 2);
  const unsigned = littleEndian ? (c << 16) | (b << 8) | a : (a << 16) | (b << 8) | c;
  return (unsigned & 0x800000) === 0 ? unsigned : unsigned - 0x1000000;
}

function unsigned24(view: DataView, offset: number, littleEndian: boolean): number {
  const a = view.getUint8(offset);
  const b = view.getUint8(offset + 1);
  const c = view.getUint8(offset + 2);
  return littleEndian ? (c << 16) | (b << 8) | a : (a << 16) | (b << 8) | c;
}

function put24(view: DataView, offset: number, value: number, littleEndian: boolean): void {
  const unsigned = value & 0xffffff;
  if (littleEndian) { view.setUint8(offset, unsigned & 0xff); view.setUint8(offset + 1, (unsigned >>> 8) & 0xff); view.setUint8(offset + 2, (unsigned >>> 16) & 0xff); }
  else { view.setUint8(offset, (unsigned >>> 16) & 0xff); view.setUint8(offset + 1, (unsigned >>> 8) & 0xff); view.setUint8(offset + 2, unsigned & 0xff); }
}

function integerCodec(formatCode: number, bytesPerSample: number, name: string, reader: (view: DataView, offset: number, littleEndian: boolean) => number, writer: (view: DataView, offset: number, value: number, littleEndian: boolean) => void): SampleCodec {
  return {
    formatCode, bytesPerSample, name,
    decode(source, sourceByteOffset, sampleCount, littleEndian, destination, destinationOffset = 0) {
      requireCodecRange(source, sourceByteOffset, sampleCount, bytesPerSample, destination.length, destinationOffset);
      for (let index = 0, offset = sourceByteOffset; index < sampleCount; index += 1, offset += bytesPerSample) destination[destinationOffset + index] = reader(source, offset, littleEndian);
    },
    encode(source, sourceOffset, sampleCount, destination, destinationByteOffset, littleEndian) {
      requireCodecRange(destination, destinationByteOffset, sampleCount, bytesPerSample, source.length, sourceOffset);
      for (let index = 0, offset = destinationByteOffset; index < sampleCount; index += 1, offset += bytesPerSample) writer(destination, offset, Math.round(finite(source[sourceOffset + index] ?? 0)), littleEndian);
    }
  };
}

const codecs: SampleCodec[] = [
  {
    formatCode: 1, bytesPerSample: 4, name: "IBM 32-bit float",
    decode(source, offset, count, littleEndian, destination, destinationOffset = 0) { requireCodecRange(source, offset, count, 4, destination.length, destinationOffset); for (let index = 0; index < count; index += 1) destination[destinationOffset + index] = ibm32ToNumber(source.getUint32(offset + index * 4, littleEndian)); },
    encode(source, sourceOffset, count, destination, offset, littleEndian) { requireCodecRange(destination, offset, count, 4, source.length, sourceOffset); for (let index = 0; index < count; index += 1) destination.setUint32(offset + index * 4, numberToIbm32(finite(source[sourceOffset + index] ?? 0)), littleEndian); }
  },
  integerCodec(2, 4, "Signed 32-bit integer", (v, o, le) => v.getInt32(o, le), (v, o, x, le) => v.setInt32(o, x, le)),
  integerCodec(3, 2, "Signed 16-bit integer", (v, o, le) => v.getInt16(o, le), (v, o, x, le) => v.setInt16(o, x, le)),
  {
    formatCode: 5, bytesPerSample: 4, name: "IEEE 32-bit float",
    decode(source, offset, count, littleEndian, destination, destinationOffset = 0) { requireCodecRange(source, offset, count, 4, destination.length, destinationOffset); for (let index = 0; index < count; index += 1) destination[destinationOffset + index] = finite(source.getFloat32(offset + index * 4, littleEndian)); },
    encode(source, sourceOffset, count, destination, offset, littleEndian) { requireCodecRange(destination, offset, count, 4, source.length, sourceOffset); for (let index = 0; index < count; index += 1) destination.setFloat32(offset + index * 4, finite(source[sourceOffset + index] ?? 0), littleEndian); }
  },
  {
    formatCode: 6, bytesPerSample: 8, name: "IEEE 64-bit float",
    decode(source, offset, count, littleEndian, destination, destinationOffset = 0) { requireCodecRange(source, offset, count, 8, destination.length, destinationOffset); for (let index = 0; index < count; index += 1) destination[destinationOffset + index] = finite(source.getFloat64(offset + index * 8, littleEndian)); },
    encode(source, sourceOffset, count, destination, offset, littleEndian) { requireCodecRange(destination, offset, count, 8, source.length, sourceOffset); for (let index = 0; index < count; index += 1) destination.setFloat64(offset + index * 8, finite(source[sourceOffset + index] ?? 0), littleEndian); }
  },
  integerCodec(7, 3, "Signed 24-bit integer", signed24, put24),
  integerCodec(8, 1, "Signed 8-bit integer", (v, o) => v.getInt8(o), (v, o, x) => v.setInt8(o, x)),
  integerCodec(9, 8, "Signed 64-bit integer", (v, o, le) => bigintSample(v.getBigInt64(o, le)), (v, o, x, le) => v.setBigInt64(o, BigInt(x), le)),
  integerCodec(10, 4, "Unsigned 32-bit integer", (v, o, le) => v.getUint32(o, le), (v, o, x, le) => v.setUint32(o, x, le)),
  integerCodec(11, 2, "Unsigned 16-bit integer", (v, o, le) => v.getUint16(o, le), (v, o, x, le) => v.setUint16(o, x, le)),
  integerCodec(12, 8, "Unsigned 64-bit integer", (v, o, le) => bigintSample(v.getBigUint64(o, le)), (v, o, x, le) => v.setBigUint64(o, BigInt(Math.max(0, x)), le)),
  integerCodec(15, 3, "Unsigned 24-bit integer", unsigned24, put24),
  integerCodec(16, 1, "Unsigned 8-bit integer", (v, o) => v.getUint8(o), (v, o, x) => v.setUint8(o, x))
];

/** Registry explicitly refuses legacy format 4 without gain metadata. */
export class SampleCodecRegistry {
  private readonly byCode = new Map<number, SampleCodec>();
  public constructor(initial: readonly SampleCodec[] = codecs) { for (const codec of initial) this.byCode.set(codec.formatCode, codec); }
  public get(formatCode: number): SampleCodec {
    const codec = this.byCode.get(formatCode);
    if (!codec) throw new UnsupportedSampleFormatError(`SEG-Y sample format ${formatCode} is not supported.`, {
      severity: "error", code: formatCode === 4 ? "FIXED_POINT_GAIN_UNSUPPORTED" : "UNSUPPORTED_SAMPLE_FORMAT",
      message: formatCode === 4 ? "Format 4 requires per-sample gain metadata that is not available in standard trace data." : `Unsupported SEG-Y sample format code ${formatCode}.`,
      recoverable: false
    });
    return codec;
  }
  public supports(formatCode: number): boolean { return this.byCode.has(formatCode); }
}

export const defaultSampleCodecRegistry = new SampleCodecRegistry();
