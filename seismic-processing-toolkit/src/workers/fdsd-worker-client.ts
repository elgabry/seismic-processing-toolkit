import { WorkerExecutionError } from "../core/errors/errors";
import type { TraceBlock } from "../core/model/trace";
import type { FdSweepDeconvolutionOptions } from "../processing/vibroseis/fd-sweep-deconvolution";
import type { SweepSignal } from "../sweep/sweep-signal";
import { fdsdPlanKey, type FdsdWorkerRequest, type FdsdWorkerResponse } from "./fdsd-protocol";

/** Vite module-worker client for FDSD; only caller-owned trace blocks are transferred. */
export class FdsdWorkerClient {
  private readonly worker = new Worker(new URL("./fdsd.worker.ts", import.meta.url), { type: "module" });
  private readonly pending = new Map<string, { readonly resolve: (block: TraceBlock) => void; readonly reject: (reason: unknown) => void }>();
  private readonly externalToInternalJobIds = new Map<string, string>();
  private sequence = 0;

  public constructor() {
    this.worker.onmessage = (event: MessageEvent<FdsdWorkerResponse>) => this.receive(event.data);
    this.worker.onerror = (event) => { for (const item of this.pending.values()) item.reject(event.error); this.pending.clear(); };
  }

  public async deconvolve(jobId: string, sweep: SweepSignal, options: FdSweepDeconvolutionOptions, block: TraceBlock, signal?: AbortSignal): Promise<TraceBlock> {
    if (this.externalToInternalJobIds.has(jobId)) throw new Error(`FDSD job ${jobId} is already active.`);
    if (signal?.aborted) throw signal.reason ?? new DOMException("Cancelled", "AbortError");
    const internalJobId = `${jobId}:${++this.sequence}`;
    this.externalToInternalJobIds.set(jobId, internalJobId);
    const onAbort = () => this.cancel(jobId);
    signal?.addEventListener("abort", onAbort, { once: true });
    this.worker.postMessage({ type: "init", jobId: internalJobId, planKey: fdsdPlanKey(sweep, options), sweep, options } satisfies FdsdWorkerRequest);
    return new Promise<TraceBlock>((resolve, reject) => {
      this.pending.set(internalJobId, {
        resolve: (result) => { signal?.removeEventListener("abort", onAbort); this.externalToInternalJobIds.delete(jobId); resolve(result); },
        reject: (reason) => { signal?.removeEventListener("abort", onAbort); this.externalToInternalJobIds.delete(jobId); reject(reason instanceof Error ? reason : new Error(String(reason))); }
      });
      this.worker.postMessage({ type: "deconvolve", jobId: internalJobId, block } satisfies FdsdWorkerRequest, [block.traceIds.buffer, block.sampleOffsets.buffer, block.samples.buffer]);
    });
  }

  public cancel(jobId: string): void {
    const internalJobId = this.externalToInternalJobIds.get(jobId);
    if (!internalJobId) return;
    this.worker.postMessage({ type: "cancel", jobId: internalJobId } satisfies FdsdWorkerRequest);
    const pending = this.pending.get(internalJobId);
    if (pending) { pending.reject(new DOMException("Cancelled", "AbortError")); this.pending.delete(internalJobId); }
  }

  public dispose(): void { this.worker.terminate(); for (const item of this.pending.values()) item.reject(new DOMException("Worker disposed", "AbortError")); this.pending.clear(); this.externalToInternalJobIds.clear(); }

  private receive(message: FdsdWorkerResponse): void {
    if (message.type === "result") { const pending = this.pending.get(message.jobId); if (pending) { this.pending.delete(message.jobId); pending.resolve(message.block); } return; }
    if (message.type === "error") { const pending = this.pending.get(message.jobId); if (pending) { this.pending.delete(message.jobId); pending.reject(new WorkerExecutionError(message.error.message, { severity: "error", code: "FDSD_WORKER_EXECUTION", message: message.error.message, recoverable: false })); } }
  }
}
