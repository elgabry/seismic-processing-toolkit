import type { Diagnostic } from "../../../core/errors/errors";
import { SmartSoloMappingError } from "../../../core/errors/errors";
import type { OutputSink } from "../../sink/output-sink";
import { defaultSampleCodecRegistry } from "../../segy/codecs/sample-codec-registry";
import { SegyDataset } from "../../segy/segy-dataset";
import { SegyWriter } from "../../segy/segy-writer";
import { SegyTraceIndex } from "../../segy/index/segy-trace-index";
import type { RandomAccessSource } from "../../source/random-access-source";
import { smartSoloDiagnostic } from "./smartsolo8058-diagnostics";
import { createSmartSoloBinaryHeader, createSmartSoloTextualHeaders, mapSmartSoloTraceToSegyHeader, normalizeSmartSoloConversionOptions, type NormalizedSmartSoloConversionOptions } from "./smartsolo8058-mapping";
import { SmartSolo8058Reader } from "./smartsolo8058-reader";
import type { SmartSoloConversionOptions, SmartSoloConversionSummary, SmartSoloOpenOptions } from "./types";

function outputName(name: string): string { const base = name.split(/[\\/]/).pop() ?? name; return base.replace(/\.(segd|sgd)$/i, "") + ".sgy"; }

/** Virtual SEG-Y header source lets the existing SegyWriter stream mapped SmartSolo traces without duplicate writer logic. */
class SmartSoloMappedHeaderSource implements RandomAccessSource {
  public readonly name: string;
  public readonly size: number;

  public constructor(private readonly reader: SmartSolo8058Reader, private readonly traceIds: Uint32Array, private readonly options: NormalizedSmartSoloConversionOptions, private readonly diagnostics: Diagnostic[]) {
    this.name = outputName(reader.source.name);
    this.size = 3600 + traceIds.length * 240;
  }

  public async read(offset: number, length: number, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (length !== 240 || offset < 3600 || (offset - 3600) % 240 !== 0) throw new RangeError("The SmartSolo SEG-Y adapter exposes only mapped 240-byte trace headers.");
    const outputTraceId = (offset - 3600) / 240;
    const sourceTraceId = this.traceIds[outputTraceId];
    if (sourceTraceId === undefined) throw new RangeError("Mapped SmartSolo trace header is outside the selected conversion range.");
    const mapped = mapSmartSoloTraceToSegyHeader(this.reader, sourceTraceId, outputTraceId, this.options);
    this.diagnostics.push(...mapped.diagnostics);
    await Promise.resolve();
    return mapped.bytes.buffer.slice(0);
  }
}

function selectedTraceIds(reader: SmartSolo8058Reader, options: NormalizedSmartSoloConversionOptions): Uint32Array {
  const ids: number[] = [];
  for (let traceId = 0; traceId < reader.traceCount; traceId += 1) {
    const traceClass = reader.index.traceAt(traceId).traceClass;
    if (traceClass === "auxiliary" && !options.includeAuxiliaryTraces) continue;
    if (traceClass === "pilot" && !options.includePilotTraces) continue;
    ids.push(traceId);
  }
  return new Uint32Array(ids);
}

function buildSegyIndex(reader: SmartSolo8058Reader, traceIds: Uint32Array): SegyTraceIndex {
  const count = traceIds.length; const headers = new Float64Array(count); const samples = new Float64Array(count); const sampleCounts = new Uint32Array(count); const intervals = new Uint32Array(count);
  const fieldRecords = new Int32Array(count); const traceNumbers = new Int32Array(count); const offsets = new Int32Array(count); const identification = new Int16Array(count); const valid = new Uint8Array(count);
  for (let outputTraceId = 0; outputTraceId < count; outputTraceId += 1) {
    const sourceTraceId = traceIds[outputTraceId] ?? 0; const trace = reader.index.traceAt(sourceTraceId);
    const headerOffset = 3600 + outputTraceId * 240;
    headers[outputTraceId] = headerOffset; samples[outputTraceId] = headerOffset + 240; sampleCounts[outputTraceId] = trace.sampleCount; intervals[outputTraceId] = trace.sampleIntervalMicroseconds;
    fieldRecords[outputTraceId] = trace.fieldRecordNumber; traceNumbers[outputTraceId] = trace.traceNumber; offsets[outputTraceId] = Math.round(Math.hypot(trace.sourceEastingCentimetres - trace.receiverEastingCentimetres, trace.sourceNorthingCentimetres - trace.receiverNorthingCentimetres) / 100); identification[outputTraceId] = trace.traceClass === "auxiliary" ? 2 : trace.traceClass === "pilot" ? 3 : 1; valid[outputTraceId] = 1;
  }
  return new SegyTraceIndex(headers, samples, sampleCounts, new Uint32Array(count), intervals, fieldRecords, traceNumbers, new Int32Array(count), offsets, identification, valid);
}

/** Streams the legacy-verified SmartSolo 8058 IEEE traces through the existing SEG-Y writer. */
export class SmartSolo8058Converter {
  public static async openAndConvert(source: RandomAccessSource, sink: OutputSink, options: SmartSoloConversionOptions = {}, openOptions: SmartSoloOpenOptions = {}): Promise<SmartSoloConversionSummary> {
    const reader = await SmartSolo8058Reader.open(source, openOptions);
    return this.convert(reader, sink, options);
  }

  public static estimate(reader: SmartSolo8058Reader, options: SmartSoloConversionOptions = {}): SmartSoloConversionSummary {
    const normalized = normalizeSmartSoloConversionOptions(options); const codec = defaultSampleCodecRegistry.get(normalized.sampleFormatCode); const traceIds = selectedTraceIds(reader, normalized);
    let sampleBytes = 0;
    for (let outputTraceId = 0; outputTraceId < traceIds.length; outputTraceId += 1) sampleBytes += (reader.index.sampleCounts[traceIds[outputTraceId] ?? 0] ?? 0) * codec.bytesPerSample;
    return { traceCount: traceIds.length, estimatedBytes: 3600 + traceIds.length * 240 + sampleBytes, diagnostics: reader.diagnostics };
  }

  public static async convert(reader: SmartSolo8058Reader, sink: OutputSink, options: SmartSoloConversionOptions = {}): Promise<SmartSoloConversionSummary> {
    const normalized = normalizeSmartSoloConversionOptions(options); const traceIds = selectedTraceIds(reader, normalized);
    if (traceIds.length === 0) throw new SmartSoloMappingError("The conversion options excluded every SmartSolo trace.", smartSoloDiagnostic("error", "SMARTSOLO_NO_SELECTED_TRACES", "Include at least one trace class before converting.", false, reader.source.name));
    const diagnostics: Diagnostic[] = [...reader.diagnostics];
    const source = new SmartSoloMappedHeaderSource(reader, traceIds, normalized, diagnostics);
    const dataset = new SegyDataset(source, createSmartSoloTextualHeaders(reader, normalized), createSmartSoloBinaryHeader(reader, normalized), buildSegyIndex(reader, traceIds), diagnostics, defaultSampleCodecRegistry.get(5), false, 0);
    const history = normalized.processingHistory ? [
      `SMARTSOLO 8058 CONVERSION INPUT=${outputName(reader.source.name)} SIZE=${reader.source.size}`,
      `SMARTSOLO REV=${reader.headers.revision} FORMAT=8058 MAP=1 OUTPUT_REV=${normalized.outputRevision} SAMPLE_FORMAT=${normalized.sampleFormatCode}`,
      `ENDIAN=${normalized.outputEndianness} TEXT=${normalized.textualEncoding} COORDINATE_SCALAR=${normalized.coordinateScalarMode}`,
      "UNMODELED SMARTSOLO FIELDS ARE PRESERVED AS RAW-HEADER HEX TEXT WHEN ENABLED"
    ] : [];
    try {
      await SegyWriter.write(dataset, sink, {
        traceIds: new Uint32Array(traceIds.length).map((_, index) => index), revision: normalized.outputRevision, sampleFormatCode: normalized.sampleFormatCode,
        endianness: normalized.outputEndianness, processingHistory: history,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        onProgress: (completed, total) => options.onProgress?.(completed, total),
        sampleProvider: async (outputTraceId) => {
          const sourceTraceId = traceIds[outputTraceId];
          if (sourceTraceId === undefined) throw new RangeError("Selected SmartSolo trace is unavailable.");
          const decoded = await reader.traces.readTrace(sourceTraceId, options.signal);
          const byteOffset = reader.index.sampleDataOffsets[sourceTraceId];
          diagnostics.push(...decoded.diagnostics.map((diagnostic) => ({ ...diagnostic, traceIndex: sourceTraceId, fileName: reader.source.name, ...(byteOffset === undefined ? {} : { byteOffset }) })));
          return decoded.samples;
        }
      }, defaultSampleCodecRegistry);
    } finally { dataset.close(); }
    return { ...this.estimate(reader, options), diagnostics };
  }
}
