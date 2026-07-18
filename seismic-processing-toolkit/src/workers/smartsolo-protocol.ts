import type { Diagnostic } from "../core/errors/errors";
import type { SmartSoloConversionOptions, SmartSoloDetectionResult } from "../io/segd/smartsolo8058/types";

export type SmartSoloWorkerPhase = "reading-headers" | "detecting" | "indexing" | "preparing-output" | "decoding" | "mapping" | "writing" | "finalizing";

export interface SmartSoloWorkerProgress {
  readonly phase: SmartSoloWorkerPhase;
  readonly completedTraces: number;
  readonly totalTraces: number;
  readonly completedBytes?: number;
  readonly totalBytes?: number;
  readonly fraction?: number;
}

export interface SmartSoloWorkerPreparedMetadata {
  readonly outputName: string;
  readonly textualHeaders: readonly Uint8Array<ArrayBuffer>[];
  readonly binaryHeader: Uint8Array<ArrayBuffer>;
  readonly sampleCounts: Uint32Array<ArrayBuffer>;
  readonly sampleIntervalsMicroseconds: Uint32Array<ArrayBuffer>;
  readonly fieldRecordNumbers: Int32Array<ArrayBuffer>;
  readonly traceNumbers: Int32Array<ArrayBuffer>;
  readonly offsets: Int32Array<ArrayBuffer>;
  readonly traceIdentificationCodes: Int16Array<ArrayBuffer>;
  readonly diagnostics: readonly Diagnostic[];
  readonly estimatedBytes: number;
}

export interface SmartSoloWorkerBatch {
  readonly traceStart: number;
  readonly traceEndExclusive: number;
  readonly headers: Uint8Array<ArrayBuffer>;
  readonly samples: Float32Array<ArrayBuffer>;
  /** Byte-free sample offsets in Float32 sample units, one more than the batch trace count. */
  readonly sampleOffsets: Uint32Array<ArrayBuffer>;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SmartSoloWorkerOpenResult {
  readonly detection: SmartSoloDetectionResult;
  readonly revision: "1.0" | "2.1";
  readonly traceCount: number;
  readonly sampleIntervalMicroseconds: number;
  readonly sourceName: string;
  readonly sourceSize: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly previewHeader: Uint8Array<ArrayBuffer>;
}

export interface SmartSoloWorkerError {
  readonly name: string;
  readonly message: string;
  readonly diagnostic?: Diagnostic;
  readonly phase: SmartSoloWorkerPhase;
}

export type SmartSoloWorkerRequest =
  | { readonly type: "open"; readonly jobId: string; readonly file: File; readonly indexWindowBytes?: number }
  | { readonly type: "prepare"; readonly jobId: string; readonly options: SmartSoloConversionOptions }
  | { readonly type: "request-batch"; readonly jobId: string; readonly traceStart: number; readonly maximumBatchBytes: number }
  | { readonly type: "cancel"; readonly jobId: string }
  | { readonly type: "dispose"; readonly jobId: string };

export type SmartSoloWorkerResponse =
  | { readonly type: "opened"; readonly jobId: string; readonly result: SmartSoloWorkerOpenResult }
  | { readonly type: "prepared"; readonly jobId: string; readonly metadata: SmartSoloWorkerPreparedMetadata }
  | { readonly type: "batch"; readonly jobId: string; readonly batch: SmartSoloWorkerBatch }
  | { readonly type: "progress"; readonly jobId: string; readonly progress: SmartSoloWorkerProgress }
  | { readonly type: "cancelled"; readonly jobId: string; readonly phase: SmartSoloWorkerPhase }
  | { readonly type: "error"; readonly jobId: string; readonly error: SmartSoloWorkerError };

/** Explicitly lists only buffers whose ownership the worker relinquishes to the main thread. */
export function smartSoloTransferables(response: SmartSoloWorkerResponse): Transferable[] {
  if (response.type === "opened") return [response.result.previewHeader.buffer];
  if (response.type === "prepared") return [
    ...response.metadata.textualHeaders.map((header) => header.buffer), response.metadata.binaryHeader.buffer,
    response.metadata.sampleCounts.buffer, response.metadata.sampleIntervalsMicroseconds.buffer,
    response.metadata.fieldRecordNumbers.buffer, response.metadata.traceNumbers.buffer,
    response.metadata.offsets.buffer, response.metadata.traceIdentificationCodes.buffer
  ];
  if (response.type === "batch") return [response.batch.headers.buffer, response.batch.samples.buffer, response.batch.sampleOffsets.buffer];
  return [];
}

export function isSmartSoloWorkerRequest(value: unknown): value is SmartSoloWorkerRequest {
  if (!value || typeof value !== "object" || !("type" in value) || !("jobId" in value)) return false;
  const request = value as { type?: unknown; jobId?: unknown; file?: unknown; options?: unknown; traceStart?: unknown; maximumBatchBytes?: unknown; indexWindowBytes?: unknown };
  if (typeof request.jobId !== "string" || request.jobId.length === 0) return false;
  if (request.type === "open") return typeof request.file === "object" && request.file !== null && (request.indexWindowBytes === undefined || Number.isSafeInteger(request.indexWindowBytes));
  if (request.type === "prepare") return typeof request.options === "object" && request.options !== null;
  if (request.type === "request-batch") return Number.isSafeInteger(request.traceStart) && (request.traceStart as number) >= 0 && Number.isSafeInteger(request.maximumBatchBytes) && (request.maximumBatchBytes as number) > 0;
  return request.type === "cancel" || request.type === "dispose";
}
