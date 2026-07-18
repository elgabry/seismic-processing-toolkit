import { CorrelationPlan } from "../processing/vibroseis/correlation";
import { emptyTraceHeaders, type TraceBlock } from "../core/model/trace";
import type { WorkerRequest, WorkerResponse } from "./protocol";

interface CachedPlan { readonly plan: CorrelationPlan; usedAt: number; }
const plans = new Map<string, CachedPlan>();
const jobs = new Map<string, string>();
const cancelled = new Set<string>();
const worker = self as DedicatedWorkerGlobalScope;
let clock = 0;
const maxCachedPlans = 8;

function retainPlan(key: string, plan: CorrelationPlan): void {
  if (plans.has(key)) return;
  while (plans.size >= maxCachedPlans) {
    let oldestKey: string | undefined;
    let oldestUse = Infinity;
    for (const [candidateKey, candidate] of plans) if (candidate.usedAt < oldestUse) { oldestKey = candidateKey; oldestUse = candidate.usedAt; }
    if (!oldestKey) break;
    const oldest = plans.get(oldestKey);
    oldest?.plan.dispose();
    plans.delete(oldestKey);
  }
  plans.set(key, { plan, usedAt: ++clock });
}

function planFor(key: string): CorrelationPlan | undefined {
  const cached = plans.get(key);
  if (!cached) return undefined;
  cached.usedAt = ++clock;
  return cached.plan;
}

function traceRange(block: TraceBlock): readonly [number, number] | undefined {
  if (block.traceIds.length === 0) return undefined;
  return [block.traceIds[0] ?? 0, block.traceIds[block.traceIds.length - 1] ?? 0];
}

function yieldToMessages(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function correlate(jobId: string, block: TraceBlock): Promise<TraceBlock | undefined> {
  const planKey = jobs.get(jobId);
  const plan = planKey ? planFor(planKey) : undefined;
  if (!plan) throw new Error("Correlation worker was not initialized for this job.");
  const results: Float32Array[] = [];
  const offsets = new Uint32Array(block.traceIds.length + 1);
  let total = 0;
  for (let row = 0; row < block.traceIds.length; row += 1) {
    if (cancelled.has(jobId)) return undefined;
    const start = block.sampleOffsets[row] ?? 0;
    const end = block.sampleOffsets[row + 1] ?? start;
    const result = plan.correlateTrace(block.samples.subarray(start, end), block.sampleIntervalSeconds).samples;
    offsets[row] = total;
    total += result.length;
    if (total > 0xffffffff) throw new RangeError("Correlated TraceBlock exceeds Uint32 offsets; reduce the worker batch size.");
    results.push(result);
    worker.postMessage({ type: "progress", jobId, completed: row + 1, total: block.traceIds.length } satisfies WorkerResponse);
    await yieldToMessages();
  }
  if (cancelled.has(jobId)) return undefined;
  offsets[block.traceIds.length] = total;
  const samples = new Float32Array(total);
  for (let row = 0; row < results.length; row += 1) samples.set(results[row] ?? new Float32Array(0), offsets[row] ?? 0);
  return { traceIds: block.traceIds.slice(), sampleOffsets: offsets, samples, sampleIntervalSeconds: block.sampleIntervalSeconds, headers: block.headers ?? emptyTraceHeaders() };
}

worker.onmessage = (event: MessageEvent<WorkerRequest>) => { void handle(event.data); };

async function handle(request: WorkerRequest): Promise<void> {
  try {
    if (request.type === "cancel") { cancelled.add(request.jobId); return; }
    if (request.type === "init") {
      if (!planFor(request.planKey)) retainPlan(request.planKey, CorrelationPlan.create(request.sweep, request.options));
      jobs.set(request.jobId, request.planKey);
      worker.postMessage({ type: "ready", jobId: request.jobId } satisfies WorkerResponse);
      return;
    }
    if (cancelled.has(request.jobId)) { cancelled.delete(request.jobId); jobs.delete(request.jobId); return; }
    const result = await correlate(request.jobId, request.block);
    if (!result) { cancelled.delete(request.jobId); jobs.delete(request.jobId); return; }
    jobs.delete(request.jobId);
    worker.postMessage({ type: "result", jobId: request.jobId, block: result } satisfies WorkerResponse, [result.traceIds.buffer, result.sampleOffsets.buffer, result.samples.buffer]);
  } catch (error) {
    const value = error instanceof Error ? error : new Error(String(error));
    const block = request.type === "correlate" ? request.block : undefined;
    const traceRangeForBlock = block === undefined ? undefined : traceRange(block);
    jobs.delete(request.jobId);
    worker.postMessage({ type: "error", jobId: request.jobId, error: { name: value.name, message: value.message, ...(value.stack === undefined ? {} : { stack: value.stack }), processorId: "correlation", ...(traceRangeForBlock === undefined ? {} : { traceRange: traceRangeForBlock }) } } satisfies WorkerResponse);
  }
}
