import type { Diagnostic } from "../core/errors/errors";
import type { OutputSink } from "../io/sink/output-sink";
import { defaultSampleCodecRegistry } from "../io/segy/codecs/sample-codec-registry";
import { BinaryHeader } from "../io/segy/headers/binary-header";
import { TextualHeader } from "../io/segy/headers/textual-header";
import { SegyTraceIndex } from "../io/segy/index/segy-trace-index";
import { SegyDataset } from "../io/segy/segy-dataset";
import { SegyWriter } from "../io/segy/segy-writer";
import type { RandomAccessSource } from "../io/source/random-access-source";
import { normalizeSmartSoloConversionOptions, type SmartSoloConversionOptions, type SmartSoloConversionSummary } from "../io/segd/smartsolo8058";
import { SmartSoloWorkerClient } from "./smartsolo-worker-client";
import type { SmartSoloWorkerBatch, SmartSoloWorkerOpenResult, SmartSoloWorkerPreparedMetadata, SmartSoloWorkerProgress } from "./smartsolo-protocol";

export interface SmartSoloWorkerConversionOptions extends SmartSoloConversionOptions {
  readonly batchMemoryBytes?: number;
  readonly onWorkerProgress?: (progress: SmartSoloWorkerProgress) => void;
}

const defaultBatchMemoryBytes = 4 * 1024 * 1024;

/** Pulls exactly one decoded/mapped batch at a time for SegyWriter; no source or batch buffer is shared backwards. */
class WorkerMappedHeaderSource implements RandomAccessSource {
  public readonly size: number;
  private batch: SmartSoloWorkerBatch | undefined;
  public readonly diagnostics: Diagnostic[] = [];

  public constructor(public readonly name: string, traceCount: number, private readonly client: SmartSoloWorkerClient, private readonly jobId: string, private readonly batchMemoryBytes: number, private readonly signal?: AbortSignal) {
    this.size = 3600 + traceCount * 240;
  }

  public async read(offset: number, length: number, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (length !== 240 || offset < 3600 || (offset - 3600) % 240 !== 0) throw new RangeError("The worker-backed SEG-Y adapter exposes only mapped 240-byte trace headers.");
    const traceId = (offset - 3600) / 240;
    const batch = await this.batchFor(traceId, signal);
    const local = traceId - batch.traceStart;
    return batch.headers.slice(local * 240, local * 240 + 240).buffer;
  }

  public async samples(traceId: number, signal?: AbortSignal): Promise<Float32Array> {
    const batch = await this.batchFor(traceId, signal);
    const local = traceId - batch.traceStart;
    const start = batch.sampleOffsets[local] ?? 0;
    const end = batch.sampleOffsets[local + 1] ?? start;
    return batch.samples.subarray(start, end);
  }

  public dispose(): void { this.batch = undefined; }

  private async batchFor(traceId: number, signal?: AbortSignal): Promise<SmartSoloWorkerBatch> {
    if (signal?.aborted || this.signal?.aborted) throw (signal ?? this.signal)?.reason ?? new DOMException("SmartSolo conversion was cancelled.", "AbortError");
    const current = this.batch;
    if (current && traceId >= current.traceStart && traceId < current.traceEndExclusive) return current;
    const next = await this.client.requestBatch(this.jobId, traceId, this.batchMemoryBytes, signal ?? this.signal);
    if (next.traceStart !== traceId || next.traceEndExclusive <= traceId) throw new Error("SmartSolo worker returned an invalid conversion batch.");
    this.diagnostics.push(...next.diagnostics); this.batch = next;
    return next;
  }
}

function outputIndex(metadata: SmartSoloWorkerPreparedMetadata): SegyTraceIndex {
  const count = metadata.sampleCounts.length;
  const headers = new Float64Array(count); const samples = new Float64Array(count); const extensions = new Uint32Array(count); const cdps = new Int32Array(count); const valid = new Uint8Array(count).fill(1);
  for (let traceId = 0; traceId < count; traceId += 1) { const headerOffset = 3600 + traceId * 240; headers[traceId] = headerOffset; samples[traceId] = headerOffset + 240; }
  return new SegyTraceIndex(headers, samples, new Uint32Array(metadata.sampleCounts), extensions, new Uint32Array(metadata.sampleIntervalsMicroseconds), new Int32Array(metadata.fieldRecordNumbers), new Int32Array(metadata.traceNumbers), cdps, new Int32Array(metadata.offsets), new Int16Array(metadata.traceIdentificationCodes), valid);
}

function outputTraceIds(count: number): Uint32Array { const ids = new Uint32Array(count); for (let index = 0; index < count; index += 1) ids[index] = index; return ids; }

/** Browser conversion orchestration: worker parses/decodes/maps; main thread owns writer, sink, and UI state. */
export class SmartSoloWorkerConverter {
  private readonly client = new SmartSoloWorkerClient();
  private readonly jobId = crypto.randomUUID();
  private opened: SmartSoloWorkerOpenResult | undefined;

  public async open(file: File, options: { readonly signal?: AbortSignal; readonly onProgress?: (progress: SmartSoloWorkerProgress) => void } = {}): Promise<SmartSoloWorkerOpenResult> {
    this.opened = await this.client.open(this.jobId, file, options.onProgress, options.signal);
    return this.opened;
  }

  public async convert(sink: OutputSink, options: SmartSoloWorkerConversionOptions = {}): Promise<SmartSoloConversionSummary> {
    if (!this.opened) throw new Error("Open a SmartSolo source in the worker before converting it.");
    const batchMemoryBytes = options.batchMemoryBytes ?? defaultBatchMemoryBytes;
    if (!Number.isSafeInteger(batchMemoryBytes) || batchMemoryBytes < 244) throw new RangeError("SmartSolo worker batch memory must be at least one trace header.");
    const metadata = await this.client.prepare(this.jobId, options, options.signal);
    const normalized = normalizeSmartSoloConversionOptions(options);
    const source = new WorkerMappedHeaderSource(metadata.outputName, metadata.sampleCounts.length, this.client, this.jobId, batchMemoryBytes, options.signal);
    const textualHeaders = metadata.textualHeaders.map((header) => new TextualHeader(header, normalized.textualEncoding));
    const binaryHeader = new BinaryHeader(metadata.binaryHeader.buffer, normalized.outputEndianness === "little");
    const diagnostics: Diagnostic[] = [...metadata.diagnostics];
    const dataset = new SegyDataset(source, textualHeaders, binaryHeader, outputIndex(metadata), diagnostics, defaultSampleCodecRegistry.get(5), false, 0);
    const history = normalized.processingHistory ? [
      `SMARTSOLO 8058 WORKER CONVERSION INPUT=${metadata.outputName} SIZE=${this.opened.sourceSize}`,
      `SMARTSOLO REV=${this.opened.revision} FORMAT=8058 MAP=1 BATCH_BYTES=${batchMemoryBytes}`,
      "WORKER PREPARES BOUNDED DECODE/MAPPING BATCHES; MAIN THREAD OWNS OUTPUT SINK"
    ] : [];
    try {
      await SegyWriter.write(dataset, sink, {
        traceIds: outputTraceIds(dataset.traceCount), revision: normalized.outputRevision, sampleFormatCode: normalized.sampleFormatCode,
        endianness: normalized.outputEndianness, processingHistory: history, ...(options.signal === undefined ? {} : { signal: options.signal }),
        onProgress: (completedTraces, totalTraces) => {
          const fraction = totalTraces > 0 ? completedTraces / totalTraces : undefined;
          options.onWorkerProgress?.({ phase: "writing", completedTraces, totalTraces, ...(fraction === undefined ? {} : { fraction }) });
          options.onProgress?.(completedTraces, totalTraces);
        },
        sampleProvider: (traceId) => source.samples(traceId, options.signal)
      });
    } finally {
      diagnostics.push(...source.diagnostics); dataset.close(); this.client.dispose(this.jobId);
    }
    return { traceCount: metadata.sampleCounts.length, estimatedBytes: metadata.estimatedBytes, diagnostics };
  }

  public cancel(): void { this.client.cancel(this.jobId); }
  public dispose(): void { this.client.dispose(this.jobId); }
}
