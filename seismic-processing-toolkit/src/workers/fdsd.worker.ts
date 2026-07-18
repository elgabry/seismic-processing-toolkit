import { emptyTraceHeaders, type TraceBlock } from "../core/model/trace";
import { FdSweepDeconvolutionPlan } from "../processing/vibroseis/fd-sweep-deconvolution";
import type { FdsdWorkerRequest, FdsdWorkerResponse } from "./fdsd-protocol";

interface CachedPlan { readonly plan: FdSweepDeconvolutionPlan; usedAt: number; }

const plans = new Map<string, CachedPlan>();
const jobs = new Map<string, string>();
const cancelled = new Set<string>();
const worker = self as DedicatedWorkerGlobalScope;
let clock = 0;

function planFor(key: string): FdSweepDeconvolutionPlan | undefined {
  const cached = plans.get(key);
  if (!cached) return undefined;
  cached.usedAt = ++clock;
  return cached.plan;
}

function retainPlan(key: string, plan: FdSweepDeconvolutionPlan): void {
  if (plans.has(key)) return;
  while (plans.size >= 4) {
    let oldestKey: string | undefined;
    let oldestUse = Infinity;
    for (const [candidateKey, candidate] of plans) if (candidate.usedAt < oldestUse) { oldestKey = candidateKey; oldestUse = candidate.usedAt; }
    if (!oldestKey) break;
    plans.get(oldestKey)?.plan.dispose();
    plans.delete(oldestKey);
  }
  plans.set(key, { plan, usedAt: ++clock });
}

function traceRange(block: TraceBlock): readonly [number, number] | undefined { return block.traceIds.length === 0 ? undefined : [block.traceIds[0] ?? 0, block.traceIds[block.traceIds.length - 1] ?? 0]; }
function yieldToMessages(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function deconvolve(jobId: string, block: TraceBlock): Promise<TraceBlock | undefined> {
  const key = jobs.get(jobId);
  const plan = key === undefined ? undefined : planFor(key);
  if (!plan) throw new Error("FDSD worker was not initialized for this job.");
  const offsets = new Uint32Array(block.traceIds.length + 1);
  const traces: Float32Array[] = [];
  let total = 0;
  for (let row = 0; row < block.traceIds.length; row += 1) {
    if (cancelled.has(jobId)) return undefined;
    const start = block.sampleOffsets[row] ?? 0;
    const end = block.sampleOffsets[row + 1] ?? start;
    const samples = plan.deconvolveTrace(block.samples.subarray(start, end), block.sampleIntervalSeconds).samples;
    offsets[row] = total;
    total += samples.length;
    if (total > 0xffffffff) throw new RangeError("FDSD worker output exceeds Uint32 sample offsets.");
    traces.push(samples);
    worker.postMessage({ type: "progress", jobId, completed: row + 1, total: block.traceIds.length } satisfies FdsdWorkerResponse);
    await yieldToMessages();
  }
  if (cancelled.has(jobId)) return undefined;
  offsets[traces.length] = total;
  const samples = new Float32Array(total);
  for (let row = 0; row < traces.length; row += 1) samples.set(traces[row] ?? new Float32Array(0), offsets[row] ?? 0);
  return { traceIds: block.traceIds.slice(), sampleOffsets: offsets, samples, sampleIntervalSeconds: block.sampleIntervalSeconds, headers: block.headers ?? emptyTraceHeaders() };
}

worker.onmessage = (event: MessageEvent<FdsdWorkerRequest>) => { void handle(event.data); };

async function handle(request: FdsdWorkerRequest): Promise<void> {
  try {
    if (request.type === "cancel") { cancelled.add(request.jobId); return; }
    if (request.type === "init") {
      if (!planFor(request.planKey)) retainPlan(request.planKey, FdSweepDeconvolutionPlan.create(request.sweep, request.options));
      jobs.set(request.jobId, request.planKey);
      worker.postMessage({ type: "ready", jobId: request.jobId } satisfies FdsdWorkerResponse);
      return;
    }
    if (cancelled.has(request.jobId)) { cancelled.delete(request.jobId); jobs.delete(request.jobId); return; }
    const result = await deconvolve(request.jobId, request.block);
    if (!result) { cancelled.delete(request.jobId); jobs.delete(request.jobId); return; }
    jobs.delete(request.jobId);
    worker.postMessage({ type: "result", jobId: request.jobId, block: result } satisfies FdsdWorkerResponse, [result.traceIds.buffer, result.sampleOffsets.buffer, result.samples.buffer]);
  } catch (error) {
    const value = error instanceof Error ? error : new Error(String(error));
    const block = request.type === "deconvolve" ? request.block : undefined;
    const range = block === undefined ? undefined : traceRange(block);
    jobs.delete(request.jobId);
    worker.postMessage({ type: "error", jobId: request.jobId, error: { name: value.name, message: value.message, ...(value.stack === undefined ? {} : { stack: value.stack }), processorId: "fdsd", ...(range === undefined ? {} : { traceRange: range }) } } satisfies FdsdWorkerResponse);
  }
}
