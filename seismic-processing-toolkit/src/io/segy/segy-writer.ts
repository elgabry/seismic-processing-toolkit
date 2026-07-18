import { HeaderValueError } from "../../core/errors/errors";
import type { OutputSink } from "../sink/output-sink";
import { defaultSampleCodecRegistry, type SampleCodecRegistry } from "./codecs/sample-codec-registry";
import { TextualHeader } from "./headers/textual-header";
import { TraceHeader } from "./headers/trace-header";
import { TraceHeaderSchema } from "./headers/trace-header-schema";
import type { SegyDataset } from "./segy-dataset";

export interface SegyWriteOptions {
  readonly traceIds?: Uint32Array;
  readonly revision?: 0 | 1 | 2;
  readonly endianness?: "preserve" | "big" | "little";
  readonly sampleFormatCode?: "preserve" | number;
  readonly processingHistory?: readonly string[];
  /** Explicit edits to standard trace-header fields. Values are raw SEG-Y values. */
  readonly traceHeaderEdits?: readonly TraceHeaderEdit[];
  /** Supplies processed samples. Omitting it streams original encoded sample bytes directly. */
  readonly sampleProvider?: (traceId: number) => Promise<Float32Array>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (completedTraces: number, totalTraces: number) => void;
}

export interface TraceHeaderEdit {
  readonly traceId: number;
  readonly fieldId: string;
  readonly value: number;
}

function uint16(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new HeaderValueError(`${field} cannot be represented in a 16-bit SEG-Y field.`, {
    severity: "error", code: "HEADER_VALUE_RANGE", message: `${field}=${value} is outside 0..65535.`, field, recoverable: false
  });
  return value;
}

function int16(value: number, field: string): number {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new HeaderValueError(`${field} cannot be represented in a signed 16-bit SEG-Y field.`, {
    severity: "error", code: "HEADER_VALUE_RANGE", message: `${field}=${value} is outside -32768..32767.`, field, recoverable: false
  });
  return value;
}

async function copyRange(dataset: SegyDataset, sink: OutputSink, offset: number, length: number, signal?: AbortSignal): Promise<void> {
  const chunkSize = 1024 * 1024;
  for (let copied = 0; copied < length; copied += chunkSize) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const bytes = await dataset.source.read(offset + copied, Math.min(chunkSize, length - copied), signal);
    await sink.write(new Uint8Array(bytes));
  }
}

function validateTraceIds(traceIds: Uint32Array, traceCount: number): void {
  for (let index = 0; index < traceIds.length; index += 1) {
    const traceId = traceIds[index] ?? -1;
    if (!Number.isInteger(traceId) || traceId < 0 || traceId >= traceCount) throw new RangeError(`Trace ${traceId} is outside the source dataset.`);
  }
}

function editsByTrace(edits: readonly TraceHeaderEdit[], traceCount: number): ReadonlyMap<number, readonly TraceHeaderEdit[]> {
  const result = new Map<number, TraceHeaderEdit[]>();
  for (const edit of edits) {
    if (!Number.isInteger(edit.traceId) || edit.traceId < 0 || edit.traceId >= traceCount) throw new RangeError(`Trace ${edit.traceId} is outside the source dataset.`);
    const existing = result.get(edit.traceId);
    if (existing) existing.push(edit);
    else result.set(edit.traceId, [edit]);
  }
  return result;
}

/** Streaming writer that preserves unknown bytes and only rewrites fields affected by export. */
export class SegyWriter {
  public static async write(dataset: SegyDataset, sink: OutputSink, options: SegyWriteOptions = {}, codecs: SampleCodecRegistry = defaultSampleCodecRegistry): Promise<void> {
    try {
      const history = options.processingHistory ?? [];
      const traceEdits = options.traceHeaderEdits ?? [];
      const hasNoEdits = options.traceIds === undefined
        && options.revision === undefined
        && (options.endianness === undefined || options.endianness === "preserve")
        && (options.sampleFormatCode === undefined || options.sampleFormatCode === "preserve")
        && options.sampleProvider === undefined
        && history.length === 0
        && traceEdits.length === 0;
      if (hasNoEdits) {
        await copyRange(dataset, sink, 0, dataset.source.size, options.signal);
        await sink.close();
        return;
      }

      const allTraceIds = new Uint32Array(dataset.traceCount);
      for (let index = 0; index < allTraceIds.length; index += 1) allTraceIds[index] = index;
      const traceIds = options.traceIds ?? allTraceIds;
      validateTraceIds(traceIds, dataset.traceCount);
      const edits = editsByTrace(traceEdits, dataset.traceCount);
      const littleEndian = options.endianness === "big" ? false : options.endianness === "little" ? true : dataset.littleEndian;
      const sampleFormat = options.sampleFormatCode === undefined || options.sampleFormatCode === "preserve" ? (options.sampleProvider ? 5 : dataset.binaryHeader.values.sampleFormatCode) : options.sampleFormatCode;
      uint16(sampleFormat, "Sample format code");
      const codec = codecs.get(sampleFormat);
      const revision = options.revision ?? dataset.binaryHeader.values.revision;
      if (revision !== 0 && revision !== 1 && revision !== 2) throw new HeaderValueError("SEG-Y revision must be 0, 1, or 2.", { severity: "error", code: "REVISION_RANGE", message: `Revision ${revision} is not supported for export.`, recoverable: false });
      const textualHeaders = [...dataset.textualHeaders];
      if (history.length > 0) {
        const encoding = dataset.textualHeaders[0]?.encoding ?? "ascii";
        const cards = history.map((line, index) => `C${String(index + 1).padStart(2, "0")} ${line}`);
        textualHeaders.push(new TextualHeader(new Uint8Array(3200), encoding).withCards(cards, encoding));
      }
      const firstTraceId = traceIds[0];
      const firstSamples = firstTraceId === undefined || !options.sampleProvider ? undefined : await options.sampleProvider(firstTraceId);
      const nominalSampleCount = firstSamples?.length ?? (firstTraceId === undefined ? dataset.binaryHeader.values.samplesPerTrace : (dataset.traceIndex.sampleCounts[firstTraceId] ?? dataset.binaryHeader.values.samplesPerTrace));
      const nominalInterval = firstTraceId === undefined ? dataset.binaryHeader.values.sampleIntervalMicroseconds : (dataset.traceIndex.sampleIntervalsMicroseconds[firstTraceId] ?? dataset.binaryHeader.values.sampleIntervalMicroseconds);
      uint16(nominalSampleCount, "Sample count"); uint16(nominalInterval, "Sample interval");
      const binary = dataset.binaryHeader.rawBytes.slice();
      const binaryView = new DataView(binary.buffer);
      binaryView.setUint16(16, nominalInterval, littleEndian); binaryView.setUint16(18, nominalInterval, littleEndian);
      binaryView.setUint16(20, nominalSampleCount, littleEndian); binaryView.setUint16(22, nominalSampleCount, littleEndian);
      binaryView.setUint16(24, sampleFormat, littleEndian); binaryView.setUint16(300, revision << 8, littleEndian);
      binaryView.setUint16(302, uint16(options.sampleProvider || traceIds.length !== dataset.traceCount ? 0 : dataset.binaryHeader.values.fixedLengthTraceFlag, "Fixed-length trace flag"), littleEndian);
      binaryView.setInt16(304, int16(textualHeaders.length - 1, "Extended textual-header count"), littleEndian);
      const primaryTextualHeader = textualHeaders[0];
      if (!primaryTextualHeader) throw new HeaderValueError("SEG-Y export requires one primary textual header.", { severity: "error", code: "MISSING_TEXTUAL_HEADER", message: "Dataset does not expose a primary 3200-byte textual header.", recoverable: false });
      await sink.write(primaryTextualHeader.rawBytes);
      await sink.write(binary);
      for (let headerIndex = 1; headerIndex < textualHeaders.length; headerIndex += 1) await sink.write((textualHeaders[headerIndex] as TextualHeader).rawBytes);
      const mustReencode = options.sampleProvider !== undefined || sampleFormat !== dataset.binaryHeader.values.sampleFormatCode || littleEndian !== dataset.littleEndian;
      for (let outputTrace = 0; outputTrace < traceIds.length; outputTrace += 1) {
        if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
        const traceId = traceIds[outputTrace] ?? 0;
        const headerBytes = 240 + (dataset.traceIndex.headerExtensionBytes[traceId] ?? 0);
        const headerBuffer = await dataset.source.read(dataset.traceIndex.headerOffsets[traceId] ?? 0, headerBytes, options.signal);
        const header = new Uint8Array(headerBuffer.slice(0));
        const headerView = new DataView(header.buffer);
        if (littleEndian !== dataset.littleEndian) this.convertKnownTraceHeaderFields(headerView, headerBuffer, dataset.littleEndian, littleEndian);
        const samples = outputTrace === 0 && firstSamples ? firstSamples : options.sampleProvider ? await options.sampleProvider(traceId) : mustReencode ? await dataset.traces.readTrace(traceId, options.signal) : undefined;
        const sampleCount = samples?.length ?? (dataset.traceIndex.sampleCounts[traceId] ?? 0);
        const interval = dataset.traceIndex.sampleIntervalsMicroseconds[traceId] ?? nominalInterval;
        uint16(sampleCount, "Trace sample count"); uint16(interval, "Trace sample interval");
        const traceHeader = new TraceHeader(header.buffer, littleEndian);
        let editedHeader = traceHeader;
        const traceEditsForTrace = edits.get(traceId) ?? [];
        for (const edit of traceEditsForTrace) editedHeader = editedHeader.withRaw(edit.fieldId, edit.value);
        header.set(editedHeader.rawBytes, 0);
        if (!traceEditsForTrace.some((edit) => edit.fieldId === "traceSequenceLine")) headerView.setInt32(0, outputTrace + 1, littleEndian);
        if (!traceEditsForTrace.some((edit) => edit.fieldId === "traceSequenceFile")) headerView.setInt32(4, outputTrace + 1, littleEndian);
        headerView.setUint16(114, sampleCount, littleEndian); headerView.setUint16(116, interval, littleEndian);
        await sink.write(header);
        if (samples) {
          const output = new Uint8Array(samples.length * codec.bytesPerSample);
          const encoder = codec.encode;
          if (!encoder) throw new HeaderValueError(`Sample codec ${sampleFormat} cannot encode SEG-Y output.`, { severity: "error", code: "NON_ENCODABLE_CODEC", message: `Codec ${sampleFormat} has no encoder.`, recoverable: false });
          encoder(samples, 0, samples.length, new DataView(output.buffer), 0, littleEndian);
          await sink.write(output);
        } else {
          await copyRange(dataset, sink, dataset.traceIndex.sampleDataOffsets[traceId] ?? 0, sampleCount * dataset.codec.bytesPerSample, options.signal);
        }
        options.onProgress?.(outputTrace + 1, traceIds.length);
      }
      await sink.close();
    } catch (error) {
      try { await sink.abort(error); } catch { /* The original export error is more useful than an abort failure. */ }
      throw error;
    }
  }

  /** Unknown bytes are retained; standard descriptor fields are rewritten when byte order changes. */
  private static convertKnownTraceHeaderFields(destination: DataView, rawSource: ArrayBuffer, sourceLittleEndian: boolean, destinationLittleEndian: boolean): void {
    const source = new TraceHeader(rawSource, sourceLittleEndian);
    for (const field of TraceHeaderSchema) {
      const value = source.raw(field.id);
      switch (field.type) {
        case "int16": destination.setInt16(field.offset, value, destinationLittleEndian); break;
        case "uint16": destination.setUint16(field.offset, value, destinationLittleEndian); break;
        case "int32": destination.setInt32(field.offset, value, destinationLittleEndian); break;
        case "uint32": destination.setUint32(field.offset, value, destinationLittleEndian); break;
      }
    }
  }
}
