import { BinaryCursor } from "../../../core/binary/cursor";
import { HeaderValueError } from "../../../core/errors/errors";
import { TraceHeaderFieldsById, type TraceHeaderFieldDescriptor } from "./trace-header-schema";
import { HeaderScalars } from "./header-scalars";

/** Applies the SEG-Y scalar convention without mutating the raw header value. */
export const applySegyScalar = HeaderScalars.apply;

/** Standard 240-byte header wrapper; raw bytes survive edits and writer round trips. */
export class TraceHeader {
  public readonly rawBytes: Uint8Array;
  private readonly cursor: BinaryCursor;

  public constructor(raw: ArrayBuffer, public readonly littleEndian: boolean) {
    if (raw.byteLength < 240) throw new RangeError("A standard SEG-Y trace header requires 240 bytes.");
    this.rawBytes = new Uint8Array(raw.slice(0, 240));
    this.cursor = new BinaryCursor(this.rawBytes.buffer, littleEndian);
  }

  public raw(id: string): number {
    const descriptor = TraceHeaderFieldsById.get(id);
    if (!descriptor) throw new HeaderValueError(`Unknown trace-header field: ${id}.`, {
      severity: "error", code: "UNKNOWN_TRACE_FIELD", message: `No field descriptor named ${id}.`, field: id, recoverable: false
    });
    return this.read(descriptor);
  }

  public scaled(id: string): number {
    const descriptor = TraceHeaderFieldsById.get(id);
    if (!descriptor) return this.raw(id);
    const raw = this.read(descriptor);
    if (descriptor.scalarField === "coordinateScalar") return applySegyScalar(raw, this.raw("coordinateScalar"));
    if (descriptor.scalarField === "elevationScalar") return applySegyScalar(raw, this.raw("elevationScalar"));
    return raw;
  }

  public withRaw(id: string, value: number): TraceHeader {
    const descriptor = TraceHeaderFieldsById.get(id);
    if (!descriptor || !descriptor.editable) throw new HeaderValueError(`Trace-header field ${id} is not editable.`, {
      severity: "error", code: "READ_ONLY_TRACE_FIELD", message: `Field ${id} cannot be edited.`, field: id, recoverable: false
    });
    if (!Number.isInteger(value) || !this.isRepresentable(descriptor, value)) throw new HeaderValueError(`Trace-header field ${id} cannot represent ${value}.`, {
      severity: "error", code: "TRACE_HEADER_VALUE_RANGE", message: `Field ${id} requires a ${descriptor.type} integer value.`, field: id, recoverable: false
    });
    const next = this.rawBytes.slice();
    const view = new DataView(next.buffer);
    switch (descriptor.type) {
      case "int16": view.setInt16(descriptor.offset, value, this.littleEndian); break;
      case "uint16": view.setUint16(descriptor.offset, value, this.littleEndian); break;
      case "int32": view.setInt32(descriptor.offset, value, this.littleEndian); break;
      case "uint32": view.setUint32(descriptor.offset, value, this.littleEndian); break;
    }
    return new TraceHeader(next.buffer, this.littleEndian);
  }

  private read(descriptor: TraceHeaderFieldDescriptor): number {
    switch (descriptor.type) {
      case "int16": return this.cursor.int16(descriptor.offset);
      case "uint16": return this.cursor.uint16(descriptor.offset);
      case "int32": return this.cursor.int32(descriptor.offset);
      case "uint32": return this.cursor.uint32(descriptor.offset);
    }
  }

  private isRepresentable(descriptor: TraceHeaderFieldDescriptor, value: number): boolean {
    switch (descriptor.type) {
      case "int16": return value >= -0x8000 && value <= 0x7fff;
      case "uint16": return value >= 0 && value <= 0xffff;
      case "int32": return value >= -0x80000000 && value <= 0x7fffffff;
      case "uint32": return value >= 0 && value <= 0xffffffff;
    }
  }
}
