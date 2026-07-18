import { type Diagnostic, SegyTruncationError, throwIfAborted } from "../../../core/errors/errors";
import type { RandomAccessSource } from "../../source/random-access-source";
import type { SampleCodec } from "../codecs/sample-codec";
import { SegyTraceIndex } from "./segy-trace-index";

export interface SegyTraceIndexProgress { readonly phase: "indexing"; readonly bytesScanned: number; readonly totalBytes: number; readonly traceCount: number; }
export interface SegyTraceIndexBuildOptions {
  readonly dataStartOffset: number;
  readonly nominalSamplesPerTrace: number;
  readonly nominalSampleIntervalMicroseconds: number;
  readonly revision: 0 | 1 | 2;
  readonly littleEndian: boolean;
  readonly bytesPerTraceHeader?: number;
  /** Maximum bounded source read used while scanning headers. */
  readonly readWindowBytes?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SegyTraceIndexProgress) => void;
}

interface MutableColumns {
  headerOffsets: number[]; sampleDataOffsets: number[]; sampleCounts: number[]; headerExtensionBytes: number[]; sampleIntervalsMicroseconds: number[];
  fieldRecordNumbers: number[]; traceNumbersWithinFieldRecord: number[]; cdpNumbers: number[]; offsets: number[]; traceIdentificationCodes: number[]; validityFlags: number[];
}

interface HeaderWindow {
  readonly offset: number;
  readonly bytes: ArrayBuffer;
}

function readHeaderValue(view: DataView, littleEndian: boolean): {
  readonly sampleCount: number;
  readonly sampleInterval: number;
  readonly extensionCount: number;
  readonly fieldRecordNumber: number;
  readonly traceNumberWithinFieldRecord: number;
  readonly cdpNumber: number;
  readonly offset: number;
  readonly traceIdentificationCode: number;
} {
  return {
    sampleCount: view.getUint16(114, littleEndian),
    sampleInterval: view.getUint16(116, littleEndian),
    extensionCount: view.getUint16(232, littleEndian),
    fieldRecordNumber: view.getInt32(8, littleEndian),
    traceNumberWithinFieldRecord: view.getInt32(12, littleEndian),
    cdpNumber: view.getInt32(20, littleEndian),
    offset: view.getInt32(36, littleEndian),
    traceIdentificationCode: view.getInt16(28, littleEndian)
  };
}

/** Scans trace headers only. Data samples are not decoded during index construction. */
export class SegyTraceIndexBuilder {
  public static async build(source: RandomAccessSource, codec: SampleCodec, options: SegyTraceIndexBuildOptions): Promise<{ readonly index: SegyTraceIndex; readonly diagnostics: readonly Diagnostic[] }> {
    const initialHeaderBytes = options.bytesPerTraceHeader ?? 240;
    if (initialHeaderBytes < 240 || initialHeaderBytes % 240 !== 0) throw new RangeError("Trace header bytes must be a positive 240-byte multiple.");
    const readWindowBytes = options.readWindowBytes ?? 64 * 1024;
    if (!Number.isSafeInteger(readWindowBytes) || readWindowBytes < initialHeaderBytes) throw new RangeError("readWindowBytes must be a safe integer at least as large as one trace header.");
    const diagnostics: Diagnostic[] = [];
    const columns: MutableColumns = {
      headerOffsets: [], sampleDataOffsets: [], sampleCounts: [], headerExtensionBytes: [], sampleIntervalsMicroseconds: [],
      fieldRecordNumbers: [], traceNumbersWithinFieldRecord: [], cdpNumbers: [], offsets: [], traceIdentificationCodes: [], validityFlags: []
    };
    let offset = options.dataStartOffset;
    let lastProgress = -1;
    let window: HeaderWindow | undefined;
    const ensureWindow = async (requiredOffset: number, requiredBytes: number): Promise<HeaderWindow> => {
      throwIfAborted(options.signal, "SEG-Y trace indexing");
      if (requiredBytes > readWindowBytes) throw new RangeError("Trace header exceeds the configured index read window.");
      if (window && requiredOffset >= window.offset && requiredOffset + requiredBytes <= window.offset + window.bytes.byteLength) return window;
      const remaining = source.size - requiredOffset;
      if (remaining < requiredBytes) throw new RangeError("Trace header is outside the source.");
      const length = Math.min(readWindowBytes, remaining);
      window = { offset: requiredOffset, bytes: await source.read(requiredOffset, length, options.signal) };
      return window;
    };
    while (offset < source.size) {
      throwIfAborted(options.signal, "SEG-Y trace indexing");
      if (source.size - offset < initialHeaderBytes) {
        diagnostics.push({ severity: "warning", code: "TRUNCATED_TRACE_HEADER", message: "Trailing bytes do not contain a complete trace header.", fileName: source.name, byteOffset: offset, traceIndex: columns.headerOffsets.length, recoverable: true });
        break;
      }
      const headerWindow = await ensureWindow(offset, initialHeaderBytes);
      const headerOffset = offset - headerWindow.offset;
      const header = readHeaderValue(new DataView(headerWindow.bytes, headerOffset, initialHeaderBytes), options.littleEndian);
      const sampleCount = header.sampleCount || options.nominalSamplesPerTrace;
      const sampleInterval = header.sampleInterval || options.nominalSampleIntervalMicroseconds;
      if (sampleCount === 0 || sampleInterval === 0) {
        diagnostics.push({ severity: "warning", code: "INVALID_TRACE_LAYOUT", message: "Trace has no usable sample count or sample interval; indexing stops here.", fileName: source.name, byteOffset: offset, traceIndex: columns.headerOffsets.length, recoverable: true });
        break;
      }
      const extensionCount = options.revision === 2 ? header.extensionCount : Math.max(0, (initialHeaderBytes - 240) / 240);
      if (extensionCount > 64) {
        diagnostics.push({ severity: "warning", code: "IMPLAUSIBLE_TRACE_HEADER_EXTENSION_COUNT", message: `Trace declares ${extensionCount} additional 240-byte headers; indexing stops before an implausible jump.`, fileName: source.name, byteOffset: offset + 232, traceIndex: columns.headerOffsets.length, recoverable: true });
        break;
      }
      const traceHeaderBytes = 240 + extensionCount * 240;
      if (source.size - offset < traceHeaderBytes) {
        diagnostics.push({ severity: "warning", code: "TRUNCATED_TRACE_HEADER_EXTENSION", message: "Trace header extensions extend beyond the source.", fileName: source.name, byteOffset: offset, traceIndex: columns.headerOffsets.length, recoverable: true });
        break;
      }
      const sampleOffset = offset + traceHeaderBytes;
      const dataBytes = sampleCount * codec.bytesPerSample;
      const traceEnd = sampleOffset + dataBytes;
      if (!Number.isSafeInteger(traceEnd) || traceEnd > source.size) {
        const issue = { severity: "error" as const, code: "TRUNCATED_TRACE_DATA", message: `Trace requires ${dataBytes} sample bytes beyond the source end.`, fileName: source.name, byteOffset: offset, traceIndex: columns.headerOffsets.length, recoverable: true };
        diagnostics.push(issue);
        break;
      }
      columns.headerOffsets.push(offset); columns.sampleDataOffsets.push(sampleOffset); columns.sampleCounts.push(sampleCount);
      columns.headerExtensionBytes.push(traceHeaderBytes - 240); columns.sampleIntervalsMicroseconds.push(sampleInterval);
      columns.fieldRecordNumbers.push(header.fieldRecordNumber); columns.traceNumbersWithinFieldRecord.push(header.traceNumberWithinFieldRecord);
      columns.cdpNumbers.push(header.cdpNumber); columns.offsets.push(header.offset); columns.traceIdentificationCodes.push(header.traceIdentificationCode); columns.validityFlags.push(1);
      offset = traceEnd;
      const progress = Math.floor((offset / Math.max(1, source.size)) * 100);
      if (progress !== lastProgress) { options.onProgress?.({ phase: "indexing", bytesScanned: offset, totalBytes: source.size, traceCount: columns.headerOffsets.length }); lastProgress = progress; }
    }
    if (columns.headerOffsets.length === 0 && source.size > options.dataStartOffset) {
      throw new SegyTruncationError("No complete SEG-Y traces could be indexed.", {
        severity: "error", code: "NO_COMPLETE_TRACES", message: "The source contains no complete trace after the reel headers.", fileName: source.name, byteOffset: options.dataStartOffset, recoverable: false
      });
    }
    return {
      index: new SegyTraceIndex(new Float64Array(columns.headerOffsets), new Float64Array(columns.sampleDataOffsets), new Uint32Array(columns.sampleCounts), new Uint32Array(columns.headerExtensionBytes), new Uint32Array(columns.sampleIntervalsMicroseconds), new Int32Array(columns.fieldRecordNumbers), new Int32Array(columns.traceNumbersWithinFieldRecord), new Int32Array(columns.cdpNumbers), new Int32Array(columns.offsets), new Int16Array(columns.traceIdentificationCodes), new Uint8Array(columns.validityFlags)),
      diagnostics
    };
  }
}
