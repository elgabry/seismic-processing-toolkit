import { WorkerExecutionError } from "../core/errors/errors";
import type { TraceBlock } from "../core/model/trace";
import type { CorrelationOptions } from "../processing/vibroseis/correlation";
import type { SweepSignal } from "../sweep/sweep-signal";
import { correlationPlanKey, type WorkerRequest, type WorkerResponse } from "./protocol";

/** Vite-compatible client that transfers only caller-owned TraceBlock buffers. */
export class CorrelationWorkerClient {
  private readonly worker = new Worker(new URL("./correlation.worker.ts", import.meta.url), { type: "module" });
  private readonly pending = new Map<string, { readonly resolve: (block: TraceBlock) => void; readonly reject: (reason: unknown) => void }>();
  private readonly externalToInternalJobIds = new Map<string, string>();
  private sequence = 0;
  public constructor() { this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data); this.worker.onerror = (event) => { for (const item of this.pending.values()) item.reject(event.error); this.pending.clear(); }; }
  public async correlate(jobId: string, sweep: SweepSignal, options: CorrelationOptions, block: TraceBlock, signal?: AbortSignal): Promise<TraceBlock> {
    if (this.externalToInternalJobIds.has(jobId)) throw new Error(`Correlation job ${jobId} is already active.`);
    if (signal?.aborted) throw signal.reason ?? new DOMException("Cancelled", "AbortError");
    const internalJobId = `${jobId}:${++this.sequence}`;
    this.externalToInternalJobIds.set(jobId, internalJobId);
    const onAbort = () => this.cancel(jobId);
    signal?.addEventListener("abort", onAbort, { once: true });
    this.worker.postMessage({ type: "init", jobId: internalJobId, planKey: correlationPlanKey(sweep, options), sweep, options } satisfies WorkerRequest);
    return new Promise<TraceBlock>((resolve, reject) => {
      this.pending.set(internalJobId, {
        resolve: (result) => { signal?.removeEventListener("abort", onAbort); this.externalToInternalJobIds.delete(jobId); resolve(result); },
        reject: (reason) => { signal?.removeEventListener("abort", onAbort); this.externalToInternalJobIds.delete(jobId); reject(reason instanceof Error ? reason : new Error(String(reason))); }
      });
      this.worker.postMessage({ type: "correlate", jobId: internalJobId, block } satisfies WorkerRequest, [block.traceIds.buffer, block.sampleOffsets.buffer, block.samples.buffer]);
    });
  }
  public cancel(jobId: string): void { const internalJobId = this.externalToInternalJobIds.get(jobId); if (!internalJobId) return; this.worker.postMessage({ type: "cancel", jobId: internalJobId } satisfies WorkerRequest); const pending = this.pending.get(internalJobId); if (pending) { pending.reject(new DOMException("Cancelled", "AbortError")); this.pending.delete(internalJobId); } }
  public dispose(): void { this.worker.terminate(); for (const item of this.pending.values()) item.reject(new DOMException("Worker disposed", "AbortError")); this.pending.clear(); this.externalToInternalJobIds.clear(); }
  private receive(message: WorkerResponse): void {
    if (message.type === "result") { const pending = this.pending.get(message.jobId); if (pending) { this.pending.delete(message.jobId); pending.resolve(message.block); } return; }
    if (message.type === "error") { const pending = this.pending.get(message.jobId); if (pending) { this.pending.delete(message.jobId); pending.reject(new WorkerExecutionError(message.error.message, { severity: "error", code: "WORKER_EXECUTION", message: message.error.message, recoverable: false })); } }
  }
}
