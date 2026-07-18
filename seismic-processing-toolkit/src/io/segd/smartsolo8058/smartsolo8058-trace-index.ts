import type { Diagnostic } from "../../../core/errors/errors";
import { ProcessingCancelledError, SmartSoloTruncationError } from "../../../core/errors/errors";
import type { RandomAccessSource } from "../../source/random-access-source";
import { SmartSolo8058, SmartSoloTraceOffsets, decodeBcd, decodeDms, decodeUint24 } from "./smartsolo8058-constants";
import { smartSoloDiagnostic } from "./smartsolo8058-diagnostics";
import type { SmartSolo8058Headers, SmartSoloIndexProgress, SmartSoloTraceMetadata } from "./types";

/** Compact columnar SmartSolo index; samples remain in the source until explicitly decoded. */
export class SmartSolo8058TraceIndex {
  public readonly traceCount: number;
  public constructor(
    public readonly traceHeaderOffsets: Float64Array,
    public readonly sampleDataOffsets: Float64Array,
    public readonly sampleCounts: Uint32Array,
    public readonly sampleIntervalsMicroseconds: Uint32Array,
    public readonly traceNumbers: Int32Array,
    public readonly fieldRecordNumbers: Int32Array,
    public readonly channelNumbers: Uint16Array,
    public readonly receiverSerials: Uint32Array,
    public readonly receiverEastingsCentimetres: Int32Array,
    public readonly receiverNorthingsCentimetres: Int32Array,
    public readonly receiverElevationsCentimetres: Int32Array,
    public readonly sourceEastingsCentimetres: Int32Array,
    public readonly sourceNorthingsCentimetres: Int32Array,
    public readonly sourceElevationsCentimetres: Int32Array,
    public readonly receiverLatitudes: Float64Array,
    public readonly receiverLongitudes: Float64Array,
    public readonly traceClasses: Uint8Array,
    public readonly validityFlags: Uint8Array
  ) {
    this.traceCount = traceHeaderOffsets.length;
    const lengths = [sampleDataOffsets, sampleCounts, sampleIntervalsMicroseconds, traceNumbers, fieldRecordNumbers, channelNumbers, receiverSerials, receiverEastingsCentimetres, receiverNorthingsCentimetres, receiverElevationsCentimetres, sourceEastingsCentimetres, sourceNorthingsCentimetres, sourceElevationsCentimetres, receiverLatitudes, receiverLongitudes, traceClasses, validityFlags].map((column) => column.length);
    if (lengths.some((length) => length !== this.traceCount)) throw new RangeError("SmartSolo trace-index columns must have equal lengths.");
  }

  public traceAt(traceId: number): SmartSoloTraceMetadata {
    if (!Number.isInteger(traceId) || traceId < 0 || traceId >= this.traceCount) throw new RangeError(`SmartSolo trace ${traceId} is outside the index.`);
    const traceClass = this.traceClasses[traceId] === 1 ? "data" : this.traceClasses[traceId] === 2 ? "auxiliary" : this.traceClasses[traceId] === 3 ? "pilot" : "unknown";
    return {
      traceId,
      traceHeaderOffset: this.traceHeaderOffsets[traceId] ?? 0,
      sampleDataOffset: this.sampleDataOffsets[traceId] ?? 0,
      sampleCount: this.sampleCounts[traceId] ?? 0,
      sampleIntervalMicroseconds: this.sampleIntervalsMicroseconds[traceId] ?? 0,
      sampleEncoding: "ieee-float32-be",
      traceNumber: this.traceNumbers[traceId] ?? 0,
      fieldRecordNumber: this.fieldRecordNumbers[traceId] ?? 0,
      channelNumber: this.channelNumbers[traceId] ?? 0,
      receiverSerial: this.receiverSerials[traceId] ?? 0,
      receiverEastingCentimetres: this.receiverEastingsCentimetres[traceId] ?? 0,
      receiverNorthingCentimetres: this.receiverNorthingsCentimetres[traceId] ?? 0,
      receiverElevationCentimetres: this.receiverElevationsCentimetres[traceId] ?? 0,
      sourceEastingCentimetres: this.sourceEastingsCentimetres[traceId] ?? 0,
      sourceNorthingCentimetres: this.sourceNorthingsCentimetres[traceId] ?? 0,
      sourceElevationCentimetres: this.sourceElevationsCentimetres[traceId] ?? 0,
      receiverLatitude: this.receiverLatitudes[traceId] ?? 0,
      receiverLongitude: this.receiverLongitudes[traceId] ?? 0,
      traceClass,
      valid: (this.validityFlags[traceId] ?? 0) === 1
    };
  }
}

interface MutableColumns {
  readonly traceHeaderOffsets: number[]; readonly sampleDataOffsets: number[]; readonly sampleCounts: number[]; readonly sampleIntervalsMicroseconds: number[];
  readonly traceNumbers: number[]; readonly fieldRecordNumbers: number[]; readonly channelNumbers: number[]; readonly receiverSerials: number[];
  readonly receiverEastings: number[]; readonly receiverNorthings: number[]; readonly receiverElevations: number[];
  readonly sourceEastings: number[]; readonly sourceNorthings: number[]; readonly sourceElevations: number[];
  readonly receiverLatitudes: number[]; readonly receiverLongitudes: number[]; readonly traceClasses: number[]; readonly validityFlags: number[];
}

function columns(): MutableColumns {
  return { traceHeaderOffsets: [], sampleDataOffsets: [], sampleCounts: [], sampleIntervalsMicroseconds: [], traceNumbers: [], fieldRecordNumbers: [], channelNumbers: [], receiverSerials: [], receiverEastings: [], receiverNorthings: [], receiverElevations: [], sourceEastings: [], sourceNorthings: [], sourceElevations: [], receiverLatitudes: [], receiverLongitudes: [], traceClasses: [], validityFlags: [] };
}

function cancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ProcessingCancelledError("SmartSolo trace indexing was cancelled.", smartSoloDiagnostic("warning", "SMARTSOLO_INDEX_CANCELLED", "SmartSolo trace indexing was cancelled.", true));
}

/** Bounded sequential indexer for the 20-byte demux header plus seven 32-byte extensions. */
export class SmartSolo8058TraceIndexBuilder {
  public static async build(source: RandomAccessSource, headers: SmartSolo8058Headers, options: { readonly signal?: AbortSignal; readonly onProgress?: (progress: SmartSoloIndexProgress) => void; readonly windowBytes?: number } = {}): Promise<{ readonly index: SmartSolo8058TraceIndex; readonly diagnostics: readonly Diagnostic[] }> {
    const diagnostics: Diagnostic[] = [smartSoloDiagnostic("info", "SMARTSOLO_TRACE_CLASS_UNKNOWN", "The legacy 8058 converter does not document an auxiliary/pilot classification field; trace classes are retained as unknown rather than guessed.", true, source.name)];
    const mutable = columns();
    const windowBytes = options.windowBytes ?? SmartSolo8058.indexingWindowBytes;
    if (!Number.isSafeInteger(windowBytes) || windowBytes < SmartSolo8058.traceHeaderBytes) throw new RangeError("SmartSolo index window must fit one complete trace header.");
    let window: ArrayBuffer | undefined;
    let windowOffset = -1;
    const readHeader = async (offset: number): Promise<DataView> => {
      if (!window || offset < windowOffset || offset + SmartSolo8058.traceHeaderBytes > windowOffset + window.byteLength) {
        const remaining = source.size - offset;
        if (remaining < SmartSolo8058.traceHeaderBytes) throw new SmartSoloTruncationError("SmartSolo trace header is truncated.", smartSoloDiagnostic("warning", "SMARTSOLO_TRUNCATED_TRACE_HEADER", "The source ended before a complete 244-byte SmartSolo trace header.", true, source.name, offset, mutable.traceHeaderOffsets.length));
        const length = Math.min(windowBytes, remaining);
        window = await source.read(offset, length, options.signal);
        windowOffset = offset;
      }
      return new DataView(window, offset - windowOffset, SmartSolo8058.traceHeaderBytes);
    };
    let offset = headers.dataOffset;
    while (offset < source.size) {
      cancelled(options.signal);
      if (source.size - offset < SmartSolo8058.traceHeaderBytes) {
        diagnostics.push(smartSoloDiagnostic("warning", "SMARTSOLO_TRAILING_BYTES", "Trailing bytes do not form a complete SmartSolo trace header and were not indexed.", true, source.name, offset, mutable.traceHeaderOffsets.length));
        break;
      }
      let traceHeader: DataView;
      try { traceHeader = await readHeader(offset); } catch (error) {
        if (error instanceof SmartSoloTruncationError) { diagnostics.push(error.diagnostic); break; }
        throw error;
      }
      const headerBytes = new Uint8Array(traceHeader.buffer, traceHeader.byteOffset, traceHeader.byteLength);
      const sampleCount = decodeUint24(headerBytes, SmartSoloTraceOffsets.sampleCountInExtensionOne) || headers.declaredSamplesPerTrace;
      if (!Number.isSafeInteger(sampleCount) || sampleCount <= 0) {
        diagnostics.push(smartSoloDiagnostic("error", "SMARTSOLO_INVALID_SAMPLE_COUNT", "A SmartSolo trace has no usable sample count; indexing stopped at the last valid trace.", true, source.name, offset, mutable.traceHeaderOffsets.length));
        break;
      }
      const sampleBytes = sampleCount * SmartSolo8058.sampleBytes;
      const traceEnd = offset + SmartSolo8058.traceHeaderBytes + sampleBytes;
      if (!Number.isSafeInteger(traceEnd) || traceEnd > source.size) {
        diagnostics.push(smartSoloDiagnostic("warning", "SMARTSOLO_TRUNCATED_TRACE_DATA", `Trace declares ${sampleCount} IEEE samples beyond the end of the source; indexing stopped.`, true, source.name, offset, mutable.traceHeaderOffsets.length));
        break;
      }
      const traceNumber = decodeBcd(headerBytes, SmartSoloTraceOffsets.traceNumberBcd, 2) || traceHeader.getUint32(SmartSoloTraceOffsets.traceNumberInExtensionTwo, false);
      const fieldRecordNumber = traceHeader.getUint32(SmartSoloTraceOffsets.fieldRecordInExtensionTwo, false) || headers.fieldRecordNumber;
      mutable.traceHeaderOffsets.push(offset); mutable.sampleDataOffsets.push(offset + SmartSolo8058.traceHeaderBytes); mutable.sampleCounts.push(sampleCount); mutable.sampleIntervalsMicroseconds.push(headers.sampleIntervalMicroseconds);
      mutable.traceNumbers.push(traceNumber); mutable.fieldRecordNumbers.push(fieldRecordNumber); mutable.channelNumbers.push(headerBytes[SmartSoloTraceOffsets.channelNumber] ?? 0); mutable.receiverSerials.push(traceHeader.getUint32(SmartSoloTraceOffsets.receiverSerial, false));
      mutable.receiverEastings.push(traceHeader.getInt32(SmartSoloTraceOffsets.receiverEasting, false)); mutable.receiverNorthings.push(traceHeader.getInt32(SmartSoloTraceOffsets.receiverNorthing, false)); mutable.receiverElevations.push(traceHeader.getInt32(SmartSoloTraceOffsets.receiverElevation, false));
      mutable.sourceEastings.push(traceHeader.getInt32(SmartSoloTraceOffsets.sourceEasting, false) || headers.fileSourceEastingCentimetres); mutable.sourceNorthings.push(traceHeader.getInt32(SmartSoloTraceOffsets.sourceNorthing, false) || headers.fileSourceNorthingCentimetres); mutable.sourceElevations.push(traceHeader.getInt32(SmartSoloTraceOffsets.sourceElevation, false) || headers.fileSourceElevationCentimetres);
      mutable.receiverLatitudes.push(decodeDms(traceHeader.getInt32(SmartSoloTraceOffsets.receiverLatitudeInteger, false), traceHeader.getUint16(SmartSoloTraceOffsets.receiverLatitudeFraction, false))); mutable.receiverLongitudes.push(decodeDms(traceHeader.getInt32(SmartSoloTraceOffsets.receiverLongitudeInteger, false), traceHeader.getUint16(SmartSoloTraceOffsets.receiverLongitudeFraction, false)));
      mutable.traceClasses.push(0); mutable.validityFlags.push(1);
      offset = traceEnd;
      options.onProgress?.({ phase: "indexing", bytesScanned: offset, totalBytes: source.size, traceCount: mutable.traceHeaderOffsets.length });
      if (headers.declaredTraceCount > 0 && mutable.traceHeaderOffsets.length >= headers.declaredTraceCount) break;
    }
    if (mutable.traceHeaderOffsets.length === 0) throw new SmartSoloTruncationError("No complete SmartSolo 8058 traces could be indexed.", smartSoloDiagnostic("error", "SMARTSOLO_NO_COMPLETE_TRACES", "The header was recognized but no complete trace was available.", false, source.name, headers.dataOffset));
    return {
      index: new SmartSolo8058TraceIndex(new Float64Array(mutable.traceHeaderOffsets), new Float64Array(mutable.sampleDataOffsets), new Uint32Array(mutable.sampleCounts), new Uint32Array(mutable.sampleIntervalsMicroseconds), new Int32Array(mutable.traceNumbers), new Int32Array(mutable.fieldRecordNumbers), new Uint16Array(mutable.channelNumbers), new Uint32Array(mutable.receiverSerials), new Int32Array(mutable.receiverEastings), new Int32Array(mutable.receiverNorthings), new Int32Array(mutable.receiverElevations), new Int32Array(mutable.sourceEastings), new Int32Array(mutable.sourceNorthings), new Int32Array(mutable.sourceElevations), new Float64Array(mutable.receiverLatitudes), new Float64Array(mutable.receiverLongitudes), new Uint8Array(mutable.traceClasses), new Uint8Array(mutable.validityFlags)),
      diagnostics
    };
  }
}
