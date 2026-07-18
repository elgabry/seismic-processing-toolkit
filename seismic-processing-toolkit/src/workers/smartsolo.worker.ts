import type { Diagnostic, SeismicError } from "../core/errors/errors";
import { BlobSource } from "../io/source/blob-source";
import {
  buildSmartSoloSegyIndex,
  createSmartSoloBinaryHeader,
  createSmartSoloTextualHeaders,
  mapSmartSoloTraceToSegyHeader,
  normalizeSmartSoloConversionOptions,
  selectedSmartSoloTraceIds,
  SmartSolo8058Converter,
  SmartSolo8058Reader,
  type NormalizedSmartSoloConversionOptions
} from "../io/segd/smartsolo8058";
import {
  isSmartSoloWorkerRequest,
  smartSoloTransferables,
  type SmartSoloWorkerError,
  type SmartSoloWorkerPhase,
  type SmartSoloWorkerPreparedMetadata,
  type SmartSoloWorkerRequest,
  type SmartSoloWorkerResponse
} from "./smartsolo-protocol";

interface SmartSoloJob {
  readonly reader: SmartSolo8058Reader;
  options?: NormalizedSmartSoloConversionOptions;
  traceIds?: Uint32Array;
  prepared?: SmartSoloWorkerPreparedMetadata;
}

const worker = self as DedicatedWorkerGlobalScope;
const jobs = new Map<string, SmartSoloJob>();
const cancelled = new Set<string>();

function outputName(name: string): string { return (name.split(/[\\/]/).pop() ?? name).replace(/\.(segd|sgd)$/i, "") + ".sgy"; }
function isCancelled(jobId: string): boolean { return cancelled.has(jobId) || !jobs.has(jobId); }
function fraction(completed: number, total: number): number | undefined { return total > 0 ? completed / total : undefined; }

function post(response: SmartSoloWorkerResponse): void { worker.postMessage(response, smartSoloTransferables(response)); }
function progress(jobId: string, phase: SmartSoloWorkerPhase, completedTraces: number, totalTraces: number, completedBytes?: number, totalBytes?: number): void {
  const completedFraction = fraction(completedTraces, totalTraces);
  post({ type: "progress", jobId, progress: { phase, completedTraces, totalTraces, ...(completedBytes === undefined ? {} : { completedBytes }), ...(totalBytes === undefined ? {} : { totalBytes }), ...(completedFraction === undefined ? {} : { fraction: completedFraction }) } });
}
function errorFor(error: unknown, phase: SmartSoloWorkerPhase): SmartSoloWorkerError {
  const value = error instanceof Error ? error : new Error(String(error));
  const seismic = value as Partial<SeismicError>;
  return { name: value.name, message: value.message, ...(seismic.diagnostic === undefined ? {} : { diagnostic: seismic.diagnostic }), phase };
}
function cloneBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> { return new Uint8Array(bytes); }

async function open(request: Extract<SmartSoloWorkerRequest, { type: "open" }>): Promise<void> {
  progress(request.jobId, "reading-headers", 0, 0, 0, request.file.size);
  progress(request.jobId, "detecting", 0, 0, 0, request.file.size);
  const source = new BlobSource(request.file);
  const reader = await SmartSolo8058Reader.open(source, {
    ...(request.indexWindowBytes === undefined ? {} : { indexWindowBytes: request.indexWindowBytes }),
    onProgress: (item) => progress(request.jobId, "indexing", item.traceCount, 0, item.bytesScanned, item.totalBytes)
  });
  if (cancelled.has(request.jobId)) { post({ type: "cancelled", jobId: request.jobId, phase: "indexing" }); return; }
  jobs.set(request.jobId, { reader });
  const preview = mapSmartSoloTraceToSegyHeader(reader, 0, 0, normalizeSmartSoloConversionOptions()).bytes;
  post({
    type: "opened", jobId: request.jobId, result: {
      detection: reader.detection, revision: reader.headers.revision, traceCount: reader.traceCount,
      sampleIntervalMicroseconds: reader.headers.sampleIntervalMicroseconds, sourceName: reader.source.name,
      sourceSize: reader.source.size, diagnostics: reader.diagnostics, previewHeader: cloneBytes(preview)
    }
  });
}

function prepare(request: Extract<SmartSoloWorkerRequest, { type: "prepare" }>): void {
  const job = jobs.get(request.jobId);
  if (!job) throw new Error(`SmartSolo worker job ${request.jobId} was not found.`);
  progress(request.jobId, "preparing-output", 0, job.reader.traceCount, 0, job.reader.source.size);
  const options = normalizeSmartSoloConversionOptions(request.options);
  const traceIds = selectedSmartSoloTraceIds(job.reader, options);
  if (traceIds.length === 0) throw new RangeError("The conversion options excluded every SmartSolo trace.");
  const index = buildSmartSoloSegyIndex(job.reader, traceIds);
  const estimate = SmartSolo8058Converter.estimate(job.reader, request.options);
  const metadata: SmartSoloWorkerPreparedMetadata = {
    outputName: outputName(job.reader.source.name),
    textualHeaders: createSmartSoloTextualHeaders(job.reader, options).map((header) => cloneBytes(header.rawBytes)),
    binaryHeader: cloneBytes(createSmartSoloBinaryHeader(job.reader, options).rawBytes),
    sampleCounts: new Uint32Array(index.sampleCounts), sampleIntervalsMicroseconds: new Uint32Array(index.sampleIntervalsMicroseconds),
    fieldRecordNumbers: new Int32Array(index.fieldRecordNumbers), traceNumbers: new Int32Array(index.traceNumbersWithinFieldRecord),
    offsets: new Int32Array(index.offsets), traceIdentificationCodes: new Int16Array(index.traceIdentificationCodes),
    diagnostics: job.reader.diagnostics, estimatedBytes: estimate.estimatedBytes
  };
  job.options = options; job.traceIds = traceIds; job.prepared = metadata;
  post({ type: "prepared", jobId: request.jobId, metadata });
}

async function nextBatch(request: Extract<SmartSoloWorkerRequest, { type: "request-batch" }>): Promise<void> {
  const job = jobs.get(request.jobId);
  if (!job?.options || !job.traceIds) throw new Error(`SmartSolo worker job ${request.jobId} has not been prepared.`);
  if (!Number.isSafeInteger(request.maximumBatchBytes) || request.maximumBatchBytes < 240 + 4) throw new RangeError("SmartSolo conversion batch budget is too small.");
  if (request.traceStart < 0 || request.traceStart >= job.traceIds.length) throw new RangeError("SmartSolo conversion batch start is outside the selected trace range.");
  const selected = job.traceIds;
  const headers: Uint8Array[] = [];
  const rows: Float32Array[] = [];
  const diagnostics: Diagnostic[] = [];
  let bytes = 0;
  let traceEndExclusive = request.traceStart;
  for (let outputTraceId = request.traceStart; outputTraceId < selected.length; outputTraceId += 1) {
    if (isCancelled(request.jobId)) { post({ type: "cancelled", jobId: request.jobId, phase: "decoding" }); return; }
    const sourceTraceId = selected[outputTraceId];
    if (sourceTraceId === undefined) break;
    const metadata = job.reader.index.traceAt(sourceTraceId);
    const traceBytes = 240 + metadata.sampleCount * Float32Array.BYTES_PER_ELEMENT;
    if (traceBytes > request.maximumBatchBytes) throw new RangeError(`SmartSolo trace ${sourceTraceId} exceeds the ${request.maximumBatchBytes}-byte conversion batch budget.`);
    if (rows.length > 0 && bytes + traceBytes > request.maximumBatchBytes) break;
    progress(request.jobId, "decoding", outputTraceId, selected.length, metadata.sampleDataOffset, job.reader.source.size);
    const decoded = await job.reader.traces.readTrace(sourceTraceId);
    if (isCancelled(request.jobId)) { post({ type: "cancelled", jobId: request.jobId, phase: "decoding" }); return; }
    progress(request.jobId, "mapping", outputTraceId, selected.length, metadata.sampleDataOffset, job.reader.source.size);
    const mapped = mapSmartSoloTraceToSegyHeader(job.reader, sourceTraceId, outputTraceId, job.options);
    headers.push(mapped.bytes); rows.push(decoded.samples); diagnostics.push(...decoded.diagnostics, ...mapped.diagnostics);
    bytes += traceBytes; traceEndExclusive = outputTraceId + 1;
    progress(request.jobId, "decoding", traceEndExclusive, selected.length, metadata.sampleDataOffset + decoded.samples.byteLength, job.reader.source.size);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const headerBytes = new Uint8Array(headers.length * 240);
  const offsets = new Uint32Array(rows.length + 1);
  let samplesLength = 0;
  for (let row = 0; row < rows.length; row += 1) { offsets[row] = samplesLength; samplesLength += rows[row]?.length ?? 0; }
  offsets[rows.length] = samplesLength;
  const samples = new Float32Array(samplesLength);
  for (let row = 0; row < rows.length; row += 1) { headerBytes.set(headers[row] ?? new Uint8Array(0), row * 240); samples.set(rows[row] ?? new Float32Array(0), offsets[row] ?? 0); }
  post({ type: "batch", jobId: request.jobId, batch: { traceStart: request.traceStart, traceEndExclusive, headers: headerBytes, samples, sampleOffsets: offsets, diagnostics } });
}

async function handle(request: SmartSoloWorkerRequest): Promise<void> {
  if (request.type === "cancel") { cancelled.add(request.jobId); post({ type: "cancelled", jobId: request.jobId, phase: "decoding" }); return; }
  if (request.type === "dispose") { cancelled.add(request.jobId); jobs.delete(request.jobId); return; }
  try {
    if (request.type === "open") await open(request);
    else if (request.type === "prepare") prepare(request);
    else await nextBatch(request);
  } catch (error) {
    const phase: SmartSoloWorkerPhase = request.type === "open" ? "indexing" : request.type === "prepare" ? "preparing-output" : "decoding";
    post({ type: "error", jobId: request.jobId, error: errorFor(error, phase) });
  }
}

worker.onmessage = (event: MessageEvent<unknown>) => {
  if (!isSmartSoloWorkerRequest(event.data)) return;
  void handle(event.data);
};
