import { HeaderValueError } from "../errors/errors";

/** Bounds-checked reader for a bounded SEG-Y header buffer. */
export class BinaryCursor {
  public readonly view: DataView;

  public constructor(buffer: ArrayBuffer, public readonly littleEndian: boolean, public readonly baseOffset = 0) {
    this.view = new DataView(buffer);
  }

  public int8(offset: number): number { this.require(offset, 1); return this.view.getInt8(offset); }
  public uint8(offset: number): number { this.require(offset, 1); return this.view.getUint8(offset); }
  public int16(offset: number): number { this.require(offset, 2); return this.view.getInt16(offset, this.littleEndian); }
  public uint16(offset: number): number { this.require(offset, 2); return this.view.getUint16(offset, this.littleEndian); }
  public int32(offset: number): number { this.require(offset, 4); return this.view.getInt32(offset, this.littleEndian); }
  public uint32(offset: number): number { this.require(offset, 4); return this.view.getUint32(offset, this.littleEndian); }
  public float32(offset: number): number { this.require(offset, 4); return this.view.getFloat32(offset, this.littleEndian); }
  public float64(offset: number): number { this.require(offset, 8); return this.view.getFloat64(offset, this.littleEndian); }
  public int64(offset: number): bigint { this.require(offset, 8); return this.view.getBigInt64(offset, this.littleEndian); }
  public uint64(offset: number): bigint { this.require(offset, 8); return this.view.getBigUint64(offset, this.littleEndian); }

  /** SEG-Y has 24-bit formats; this does not allocate intermediate byte objects. */
  public int24(offset: number): number {
    const value = this.uint24(offset);
    return (value & 0x800000) === 0 ? value : value - 0x1000000;
  }

  public uint24(offset: number): number {
    this.require(offset, 3);
    const a = this.view.getUint8(offset);
    const b = this.view.getUint8(offset + 1);
    const c = this.view.getUint8(offset + 2);
    return this.littleEndian ? (c << 16) | (b << 8) | a : (a << 16) | (b << 8) | c;
  }

  public bytes(offset: number, length: number): Uint8Array {
    this.require(offset, length);
    return new Uint8Array(this.view.buffer, this.view.byteOffset + offset, length);
  }

  private require(offset: number, length: number): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > this.view.byteLength) {
      throw new HeaderValueError("Header read exceeds the available byte range.", {
        severity: "error",
        code: "HEADER_BOUNDS",
        message: `Requested bytes ${this.baseOffset + offset}..${this.baseOffset + offset + length - 1} outside a ${this.view.byteLength}-byte buffer.`,
        byteOffset: this.baseOffset + offset,
        recoverable: false
      });
    }
  }
}

export function safeBigIntToNumber(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new HeaderValueError(`${field} cannot be represented safely as a JavaScript number.`, {
      severity: "error",
      code: "UNSAFE_64_BIT_VALUE",
      message: `${field} has value ${value.toString()}, outside the JavaScript safe-integer range.`,
      field,
      recoverable: false
    });
  }
  return result;
}
