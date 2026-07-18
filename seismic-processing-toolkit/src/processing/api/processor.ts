import type { Diagnostic } from "../../core/errors/errors";
import type { TraceBlock } from "../../core/model/trace";

export interface ProcessingInputMetadata { readonly traceCount: number; readonly maximumSamplesPerTrace: number; readonly sampleIntervalSeconds: number; }
export interface ValidationIssue { readonly severity: "warning" | "error"; readonly field?: string; readonly message: string; }
export interface ResourceEstimate { readonly peakBytes: number; readonly operations: number; readonly workerRecommended: boolean; }
export interface ProcessingContext { readonly signal: AbortSignal; readonly reportProgress: (completed: number, total: number) => void; readonly diagnostics: { add(diagnostic: Diagnostic): void }; readonly execution: "main" | "worker"; readonly memoryBudgetBytes: number; }

/** Serializable Phase 1 processor interface; all time parameters are seconds at this layer. */
export interface SeismicProcessor<P> {
  readonly id: string; readonly version: string; readonly displayName: string;
  validate(input: ProcessingInputMetadata, parameters: P): readonly ValidationIssue[];
  estimateResources(input: ProcessingInputMetadata, parameters: P): ResourceEstimate;
  processBlock(block: TraceBlock, parameters: P, context: ProcessingContext): Promise<TraceBlock>;
}
