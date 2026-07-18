import type { SmartSoloConversionOptions } from "../io/segd/smartsolo8058/types";
import type {
  SmartSoloWorkerBatch,
  SmartSoloWorkerOpenResult,
  SmartSoloWorkerPreparedMetadata,
  SmartSoloWorkerProgress,
  SmartSoloWorkerRequest,
  SmartSoloWorkerResponse
} from "./smartsolo-protocol";

type ResponseType = "opened" | "prepared" | "batch";
type Pending = { readonly resolve: (response: SmartSoloWorkerResponse) => void; readonly reject: (reason: unknown) => void };

function abortError(): DOMException { return new DOMException("SmartSolo worker operation was cancelled.", "AbortError"); }
function asError(reason: unknown): Error { return reason instanceof Error ? reason : new Error(String(reason)); }
function serializableOptions(options: SmartSoloConversionOptions): SmartSoloConversionOptions {
  const { signal, onProgress, ...rest } = options;
  // Worker-specific callbacks and memory controls may be supplied by the browser
  // orchestrator but are not structured-cloneable conversion options.
  const extended = rest as SmartSoloConversionOptions & { readonly onWorkerProgress?: unknown; readonly batchMemoryBytes?: unknown };
  const { onWorkerProgress, batchMemoryBytes, ...serializable } = extended;
  void signal; void onProgress; void onWorkerProgress; void batchMemoryBytes;
  return serializable;
}

/** Module-worker client. The caller owns output sinks; the worker owns only the cloned File and bounded batches. */
export class SmartSoloWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, Pending>();
  private readonly progressListeners = new Map<string, (progress: SmartSoloWorkerProgress) => void>();
  private disposed = false;

  public constructor() {
    if (typeof Worker === "undefined") throw new Error("Module workers are unavailable in this browser; SmartSolo conversion cannot start.");
    this.worker = new Worker(new URL("./smartsolo.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<SmartSoloWorkerResponse>) => this.receive(event.data);
    this.worker.onerror = (event) => this.failAll(event.error ?? new Error(event.message));
  }

  public async open(jobId: string, file: File, onProgress?: (progress: SmartSoloWorkerProgress) => void, signal?: AbortSignal): Promise<SmartSoloWorkerOpenResult> {
    this.progressListeners.set(jobId, onProgress ?? (() => undefined));
    return this.request(jobId, "opened", { type: "open", jobId, file }, signal) as Promise<SmartSoloWorkerOpenResult>;
  }

  public async prepare(jobId: string, options: SmartSoloConversionOptions, signal?: AbortSignal): Promise<SmartSoloWorkerPreparedMetadata> {
    return this.request(jobId, "prepared", { type: "prepare", jobId, options: serializableOptions(options) }, signal) as Promise<SmartSoloWorkerPreparedMetadata>;
  }

  public async requestBatch(jobId: string, traceStart: number, maximumBatchBytes: number, signal?: AbortSignal): Promise<SmartSoloWorkerBatch> {
    return this.request(jobId, "batch", { type: "request-batch", jobId, traceStart, maximumBatchBytes }, signal) as Promise<SmartSoloWorkerBatch>;
  }

  public cancel(jobId: string): void {
    if (this.disposed) return;
    this.worker.postMessage({ type: "cancel", jobId } satisfies SmartSoloWorkerRequest);
    this.rejectJob(jobId, abortError());
  }

  public dispose(jobId?: string): void {
    if (this.disposed) return;
    if (jobId) this.worker.postMessage({ type: "dispose", jobId } satisfies SmartSoloWorkerRequest);
    this.disposed = true; this.worker.terminate(); this.failAll(abortError()); this.progressListeners.clear();
  }

  private request(jobId: string, expected: ResponseType, message: SmartSoloWorkerRequest, signal?: AbortSignal): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("SmartSolo worker client has been disposed."));
    if (signal?.aborted) return Promise.reject(asError(signal.reason ?? abortError()));
    const key = `${jobId}:${expected}`;
    if (this.pending.has(key)) return Promise.reject(new Error(`SmartSolo worker already has a pending ${expected} request for job ${jobId}.`));
    return new Promise<unknown>((resolve, reject) => {
      const onAbort = () => { this.cancel(jobId); signal?.removeEventListener("abort", onAbort); };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(key, {
        resolve: (response) => { signal?.removeEventListener("abort", onAbort); resolve(response.type === "opened" ? response.result : response.type === "prepared" ? response.metadata : response.type === "batch" ? response.batch : response); },
        reject: (reason) => { signal?.removeEventListener("abort", onAbort); reject(asError(reason)); }
      });
      this.worker.postMessage(message);
    });
  }

  private receive(response: SmartSoloWorkerResponse): void {
    if (response.type === "progress") { this.progressListeners.get(response.jobId)?.(response.progress); return; }
    if (response.type === "cancelled") { this.rejectJob(response.jobId, abortError()); return; }
    if (response.type === "error") { this.rejectJob(response.jobId, Object.assign(new Error(response.error.message), { name: response.error.name, diagnostic: response.error.diagnostic, phase: response.error.phase })); return; }
    const key = `${response.jobId}:${response.type}`;
    const pending = this.pending.get(key);
    if (!pending) return; // A stale job response must never affect the active dialog.
    this.pending.delete(key); pending.resolve(response);
  }

  private rejectJob(jobId: string, reason: unknown): void { for (const [key, pending] of this.pending) if (key.startsWith(`${jobId}:`)) { this.pending.delete(key); pending.reject(reason); } }
  private failAll(reason: unknown): void { for (const pending of this.pending.values()) pending.reject(reason); this.pending.clear(); }
}
