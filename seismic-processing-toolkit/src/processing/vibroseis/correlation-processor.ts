import type { TraceBlock } from "../../core/model/trace";
import type { ProcessingContext, ProcessingInputMetadata, ResourceEstimate, SeismicProcessor, ValidationIssue } from "../api/processor";
import type { SweepSignal } from "../../sweep/sweep-signal";
import { CorrelationPlan, type CorrelationOptions } from "./correlation";
export interface CorrelationProcessorParameters { readonly sweep: SweepSignal; readonly options: CorrelationOptions; }
/** Processor wrapper permits correlation to participate in a serializable processing graph (sweep payload externalised by UI provenance). */
export class CorrelationProcessor implements SeismicProcessor<CorrelationProcessorParameters> {
  public readonly id = "vibroseis-correlation"; public readonly version = "1.0.0"; public readonly displayName = "Vibroseis correlation";
  public validate(input: ProcessingInputMetadata, parameters: CorrelationProcessorParameters): readonly ValidationIssue[] { const issues: ValidationIssue[] = []; if (parameters.sweep.samples.length === 0) issues.push({ severity: "error", message: "Sweep has no samples." }); if (Math.abs(parameters.sweep.sampleIntervalSeconds - input.sampleIntervalSeconds) > input.sampleIntervalSeconds * 1e-9) issues.push({ severity: "error", message: "Resample sweep or traces before correlation." }); return issues; }
  public estimateResources(input: ProcessingInputMetadata, parameters: CorrelationProcessorParameters): ResourceEstimate { return { peakBytes: input.maximumSamplesPerTrace * 24 + parameters.sweep.samples.byteLength * 4, operations: input.traceCount * input.maximumSamplesPerTrace * parameters.sweep.samples.length, workerRecommended: true }; }
  public async processBlock(block: TraceBlock, parameters: CorrelationProcessorParameters, context: ProcessingContext): Promise<TraceBlock> { if (context.signal.aborted) throw context.signal.reason ?? new DOMException("Aborted", "AbortError"); const plan = CorrelationPlan.create(parameters.sweep, parameters.options); try { const result = plan.correlateBlock(block); context.reportProgress(block.traceIds.length, block.traceIds.length); await Promise.resolve(); return result; } finally { plan.dispose(); } }
}
