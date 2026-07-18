import { throwIfAborted } from "../../core/errors/errors";
import type { TraceBlock } from "../../core/model/trace";
import type { ProcessingContext, ProcessingInputMetadata, ResourceEstimate, SeismicProcessor, ValidationIssue } from "../api/processor";

export interface GainParameters { readonly mode: "constant" | "time-power" | "exponential" | "spherical" | "agc" | "balance"; readonly factor?: number; readonly exponent?: number; readonly windowSeconds?: number; readonly agcMode?: "rms" | "mean-absolute"; }
function cloneBlock(block: TraceBlock, samples: Float32Array): TraceBlock { return { ...block, traceIds: block.traceIds.slice(), sampleOffsets: block.sampleOffsets.slice(), samples }; }
/** Display/processing gain with finite edge-aware AGC windows. */
export class GainProcessor implements SeismicProcessor<GainParameters> {
  public readonly id = "gain"; public readonly version = "1.0.0"; public readonly displayName = "Gain";
  public validate(input: ProcessingInputMetadata, parameters: GainParameters): readonly ValidationIssue[] { const issues: ValidationIssue[] = []; if (!(input.sampleIntervalSeconds > 0)) issues.push({ severity: "error", message: "Sample interval must be positive." }); if (parameters.mode === "agc" && !((parameters.windowSeconds ?? 0) > 0)) issues.push({ severity: "error", field: "windowSeconds", message: "AGC requires a positive window in seconds." }); return issues; }
  public estimateResources(input: ProcessingInputMetadata): ResourceEstimate { return { peakBytes: input.maximumSamplesPerTrace * 12, operations: input.maximumSamplesPerTrace * input.traceCount * 6, workerRecommended: input.traceCount > 32 }; }
  public async processBlock(block: TraceBlock, parameters: GainParameters, context: ProcessingContext): Promise<TraceBlock> {
    const output = block.samples.slice(); const dt = block.sampleIntervalSeconds;
    for (let row = 0; row < block.traceIds.length; row += 1) {
      throwIfAborted(context.signal, "Gain processing");
      const start = block.sampleOffsets[row] ?? 0; const end = block.sampleOffsets[row + 1] ?? start; const trace = output.subarray(start, end);
      if (parameters.mode === "agc") this.agc(trace, Math.max(1, Math.round((parameters.windowSeconds ?? 0) / dt)), parameters.agcMode ?? "rms");
      else if (parameters.mode === "balance") this.balance(trace);
      else for (let index = 0; index < trace.length; index += 1) { const time = index * dt; const factor = parameters.mode === "constant" ? parameters.factor ?? 1 : parameters.mode === "time-power" ? Math.pow(Math.max(time, dt), parameters.exponent ?? 1) : parameters.mode === "exponential" ? Math.exp((parameters.factor ?? 0) * time) : Math.pow(Math.max(time, dt), parameters.exponent ?? 1); trace[index] = (trace[index] ?? 0) * factor; }
      context.reportProgress(row + 1, block.traceIds.length);
    }
    await Promise.resolve();
    return cloneBlock(block, output);
  }
  private agc(trace: Float32Array, window: number, mode: "rms" | "mean-absolute"): void { const prefix = new Float64Array(trace.length + 1); for (let index = 0; index < trace.length; index += 1) prefix[index + 1] = (prefix[index] ?? 0) + (mode === "rms" ? (trace[index] ?? 0) ** 2 : Math.abs(trace[index] ?? 0)); const half = Math.floor(window / 2); for (let index = 0; index < trace.length; index += 1) { const start = Math.max(0, index - half); const end = Math.min(trace.length, index + half + 1); const value = ((prefix[end] ?? 0) - (prefix[start] ?? 0)) / Math.max(1, end - start); const scale = mode === "rms" ? Math.sqrt(value) : value; trace[index] = scale > Number.EPSILON ? (trace[index] ?? 0) / scale : 0; } }
  private balance(trace: Float32Array): void { let sum = 0; for (let index = 0; index < trace.length; index += 1) sum += (trace[index] ?? 0) ** 2; const rms = Math.sqrt(sum / Math.max(1, trace.length)); if (rms > Number.EPSILON) for (let index = 0; index < trace.length; index += 1) trace[index] = (trace[index] ?? 0) / rms; }
}
