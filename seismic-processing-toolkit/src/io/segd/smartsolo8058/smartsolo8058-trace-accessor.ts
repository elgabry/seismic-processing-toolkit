import { ProcessingCancelledError, UnsupportedSmartSoloEncodingError } from "../../../core/errors/errors";
import type { Diagnostic } from "../../../core/errors/errors";
import type { RandomAccessSource } from "../../source/random-access-source";
import { smartSoloDiagnostic } from "./smartsolo8058-diagnostics";
import type { SmartSolo8058TraceIndex } from "./smartsolo8058-trace-index";

export interface SmartSoloDecodeResult { readonly samples: Float32Array; readonly diagnostics: readonly Diagnostic[]; }

/** Decodes SmartSolo 8058's legacy-verified big-endian IEEE Float32 samples into caller-owned memory. */
export function decodeSmartSolo8058Samples(source: DataView, sampleCount: number, destination: Float32Array, destinationOffset = 0): readonly Diagnostic[] {
  if (!Number.isSafeInteger(sampleCount) || !Number.isSafeInteger(destinationOffset) || sampleCount < 0 || destinationOffset < 0 || sampleCount * 4 > source.byteLength || destinationOffset + sampleCount > destination.length) throw new RangeError("SmartSolo sample decode source or destination range is invalid.");
  let nonFiniteCount = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const value = source.getFloat32(index * 4, false);
    destination[destinationOffset + index] = value;
    if (!Number.isFinite(value)) nonFiniteCount += 1;
  }
  return nonFiniteCount === 0 ? [] : [smartSoloDiagnostic("warning", "SMARTSOLO_NONFINITE_SAMPLES", `${nonFiniteCount} IEEE Float32 samples are NaN or infinite and were preserved for transparent conversion.`, true)];
}

/** Lazy accessor; it never reads samples while the trace index is being built. */
export class SmartSolo8058TraceAccessor {
  public constructor(private readonly source: RandomAccessSource, private readonly index: SmartSolo8058TraceIndex) {}

  public async readTrace(traceId: number, signal?: AbortSignal): Promise<SmartSoloDecodeResult> {
    const trace = this.index.traceAt(traceId);
    if (trace.sampleEncoding !== "ieee-float32-be") throw new UnsupportedSmartSoloEncodingError(`SmartSolo sample encoding ${trace.sampleEncoding} is unsupported.`, smartSoloDiagnostic("error", "SMARTSOLO_UNSUPPORTED_ENCODING", "Only the legacy-verified big-endian IEEE Float32 8058 encoding is supported.", false, this.source.name, trace.sampleDataOffset, traceId));
    if (signal?.aborted) throw new ProcessingCancelledError("SmartSolo sample decode was cancelled.", smartSoloDiagnostic("warning", "SMARTSOLO_DECODE_CANCELLED", "SmartSolo sample decode was cancelled.", true, this.source.name, trace.sampleDataOffset, traceId));
    const bytes = await this.source.read(trace.sampleDataOffset, trace.sampleCount * 4, signal);
    if (signal?.aborted) throw new ProcessingCancelledError("SmartSolo sample decode was cancelled.", smartSoloDiagnostic("warning", "SMARTSOLO_DECODE_CANCELLED", "SmartSolo sample decode was cancelled.", true, this.source.name, trace.sampleDataOffset, traceId));
    const samples = new Float32Array(trace.sampleCount);
    const diagnostics = decodeSmartSolo8058Samples(new DataView(bytes), trace.sampleCount, samples);
    return { samples, diagnostics };
  }

  public async readTraceInto(traceId: number, destination: Float32Array, destinationOffset = 0, signal?: AbortSignal): Promise<readonly Diagnostic[]> {
    const trace = this.index.traceAt(traceId);
    if (destinationOffset + trace.sampleCount > destination.length) throw new RangeError("SmartSolo destination does not have room for the requested trace.");
    const bytes = await this.source.read(trace.sampleDataOffset, trace.sampleCount * 4, signal);
    return decodeSmartSolo8058Samples(new DataView(bytes), trace.sampleCount, destination, destinationOffset);
  }
}
