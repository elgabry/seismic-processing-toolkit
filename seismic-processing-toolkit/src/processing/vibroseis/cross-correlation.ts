import type { SweepSignal } from "../../sweep/sweep-signal";
import { CorrelationPlan, type CorrelationOptions, type CorrelationResult } from "./correlation";
/** Stateless convenience facade for one correlation; reusable callers should retain CorrelationPlan. */
export class CrossCorrelation {
  public static correlate(trace: Float32Array, sampleIntervalSeconds: number, sweep: SweepSignal, options: CorrelationOptions): CorrelationResult { const plan = CorrelationPlan.create(sweep, options); try { return plan.correlateTrace(trace, sampleIntervalSeconds); } finally { plan.dispose(); } }
}
