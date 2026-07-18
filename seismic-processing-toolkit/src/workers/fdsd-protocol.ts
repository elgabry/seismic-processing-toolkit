import type { TraceBlock } from "../core/model/trace";
import type { FdSweepDeconvolutionOptions } from "../processing/vibroseis/fd-sweep-deconvolution";
import type { SweepSignal } from "../sweep/sweep-signal";

export type FdsdWorkerRequest =
  | { readonly type: "init"; readonly jobId: string; readonly planKey: string; readonly sweep: SweepSignal; readonly options: FdSweepDeconvolutionOptions }
  | { readonly type: "deconvolve"; readonly jobId: string; readonly block: TraceBlock }
  | { readonly type: "cancel"; readonly jobId: string };

export type FdsdWorkerResponse =
  | { readonly type: "ready"; readonly jobId: string }
  | { readonly type: "progress"; readonly jobId: string; readonly completed: number; readonly total: number }
  | { readonly type: "result"; readonly jobId: string; readonly block: TraceBlock }
  | { readonly type: "error"; readonly jobId: string; readonly error: { readonly name: string; readonly message: string; readonly stack?: string; readonly processorId: string; readonly traceRange?: readonly [number, number] } };

/** Stable key for a cached FDSD inverse plan. */
export function fdsdPlanKey(sweep: SweepSignal, options: FdSweepDeconvolutionOptions): string {
  const words = new Uint32Array(sweep.samples.buffer, sweep.samples.byteOffset, sweep.samples.byteLength / Float32Array.BYTES_PER_ELEMENT);
  let hash = 0x811c9dc5;
  for (let index = 0; index < words.length; index += 1) { hash ^= words[index] ?? 0; hash = Math.imul(hash, 0x01000193); }
  return JSON.stringify({ sweepHash: hash >>> 0, sweepLength: sweep.samples.length, sampleIntervalSeconds: sweep.sampleIntervalSeconds, ...options });
}
