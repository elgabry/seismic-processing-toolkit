import { Radix2Fft } from "../../core/math/radix2-fft";
import { emptyTraceHeaders, type TraceBlock } from "../../core/model/trace";
import type { SweepSignal } from "../../sweep/sweep-signal";

export interface CorrelationOptions {
  readonly output: "same" | "full" | "valid";
  readonly algorithm: "auto" | "direct" | "fft";
  readonly removeTraceMean: boolean;
  readonly removeSweepMean: boolean;
  readonly sweepTaperFraction: number;
  readonly normalization: "none" | "sweep-energy" | "global-coefficient" | "local-coefficient";
  readonly directOperationThreshold?: number;
  readonly fftBlockSamples?: number;
}
export interface CorrelationResult { readonly samples: Float32Array; readonly firstLagSamples: number; readonly sampleIntervalSeconds: number; readonly algorithmUsed: "direct" | "fft"; readonly nonFiniteInputCount: number; }

const defaults: CorrelationOptions = { output: "same", algorithm: "auto", removeTraceMean: true, removeSweepMean: true, sweepTaperFraction: 0, normalization: "sweep-energy", directOperationThreshold: 200_000 };
function normal(value: number): number { return Number.isFinite(value) ? value : 0; }
function meanRemoved(samples: Float32Array, removeMean: boolean, taperFraction: number): { readonly values: Float32Array; readonly nonFiniteCount: number } {
  let sum = 0; let count = 0; let nonFiniteCount = 0;
  for (let index = 0; index < samples.length; index += 1) { const value = samples[index] ?? 0; if (Number.isFinite(value)) { sum += value; count += 1; } else nonFiniteCount += 1; }
  const mean = removeMean && count > 0 ? sum / count : 0; const result = new Float32Array(samples.length); const tapered = Math.floor(samples.length * Math.max(0, Math.min(0.5, taperFraction)));
  for (let index = 0; index < samples.length; index += 1) {
    let value = normal(samples[index] ?? 0) - mean;
    if (tapered > 0) { if (index < tapered) value *= 0.5 * (1 - Math.cos(Math.PI * index / tapered)); if (index >= samples.length - tapered) value *= 0.5 * (1 - Math.cos(Math.PI * (samples.length - 1 - index) / tapered)); }
    result[index] = value;
  }
  return { values: result, nonFiniteCount };
}
function select(full: Float64Array, traceLength: number, sweepLength: number, mode: CorrelationOptions["output"]): { readonly values: Float64Array; readonly firstLag: number } {
  if (mode === "full") return { values: full, firstLag: -(sweepLength - 1) };
  if (mode === "same") return { values: full.slice(sweepLength - 1, sweepLength - 1 + traceLength), firstLag: 0 };
  if (traceLength < sweepLength) return { values: new Float64Array(0), firstLag: 0 };
  return { values: full.slice(sweepLength - 1, traceLength), firstLag: 0 };
}

/** Correlation convention: r[l] = sum_n x[n+l] s[n]. Full index k has lag k-(M-1). */
export class CorrelationPlan {
  private readonly options: CorrelationOptions;
  private readonly sweep: Float32Array;
  private readonly spectrum = new Map<number, { readonly real: Float64Array; readonly imaginary: Float64Array }>();
  private readonly fftScratch = new Map<number, { readonly real: Float64Array; readonly imaginary: Float64Array }>();
  private disposed = false;

  private constructor(private readonly sourceSweep: SweepSignal, options: CorrelationOptions) {
    this.options = { ...defaults, ...options };
    this.sweep = meanRemoved(sourceSweep.samples, this.options.removeSweepMean, this.options.sweepTaperFraction).values;
  }
  public static create(sweep: SweepSignal, options: CorrelationOptions): CorrelationPlan { if (!(sweep.sampleIntervalSeconds > 0) || sweep.samples.length === 0) throw new RangeError("Sweep must contain samples at a positive interval."); return new CorrelationPlan(sweep, options); }

  public correlateTrace(trace: Float32Array, sampleIntervalSeconds: number, destination?: Float32Array): CorrelationResult {
    if (this.disposed) throw new Error("CorrelationPlan has been disposed.");
    if (Math.abs(sampleIntervalSeconds - this.sourceSweep.sampleIntervalSeconds) > sampleIntervalSeconds * 1e-9) throw new RangeError("Correlation requires matching trace and sweep sample intervals; resample first.");
    const prepared = meanRemoved(trace, this.options.removeTraceMean, 0); const operationCount = prepared.values.length * this.sweep.length;
    const algorithm = this.options.algorithm === "auto" ? operationCount <= (this.options.directOperationThreshold ?? 200_000) ? "direct" : "fft" : this.options.algorithm;
    const full = algorithm === "direct" ? this.direct(prepared.values) : this.fft(prepared.values);
    this.normalize(full, prepared.values, this.sweep);
    const selected = select(full, prepared.values.length, this.sweep.length, this.options.output);
    const output = destination && destination.length === selected.values.length ? destination : new Float32Array(selected.values.length);
    for (let index = 0; index < output.length; index += 1) output[index] = selected.values[index] ?? 0;
    return { samples: output, firstLagSamples: selected.firstLag, sampleIntervalSeconds, algorithmUsed: algorithm, nonFiniteInputCount: prepared.nonFiniteCount };
  }

  /** Processes variable-length traces one at a time so workers can cancel between traces. */
  public correlateBlock(block: TraceBlock, shouldCancel?: () => boolean): TraceBlock {
    const lengths: number[] = []; const results: Float32Array[] = [];
    for (let row = 0; row < block.traceIds.length; row += 1) { if (shouldCancel?.()) throw new DOMException("Correlation cancelled", "AbortError"); const start = block.sampleOffsets[row] ?? 0; const end = block.sampleOffsets[row + 1] ?? start; const result = this.correlateTrace(block.samples.subarray(start, end), block.sampleIntervalSeconds); results.push(result.samples); lengths.push(result.samples.length); }
    const offsets = new Uint32Array(results.length + 1); let total = 0; for (let index = 0; index < results.length; index += 1) { offsets[index] = total; total += lengths[index] ?? 0; } offsets[results.length] = total;
    const samples = new Float32Array(total); for (let index = 0; index < results.length; index += 1) samples.set(results[index] ?? new Float32Array(0), offsets[index] ?? 0);
    return { traceIds: block.traceIds.slice(), sampleOffsets: offsets, samples, sampleIntervalSeconds: block.sampleIntervalSeconds, headers: block.headers ?? emptyTraceHeaders() };
  }
  public dispose(): void { this.spectrum.clear(); this.fftScratch.clear(); this.disposed = true; }

  private direct(trace: Float32Array): Float64Array {
    const full = new Float64Array(trace.length + this.sweep.length - 1);
    for (let lag = -(this.sweep.length - 1); lag < trace.length; lag += 1) {
      let sum = 0; const start = Math.max(0, -lag); const end = Math.min(this.sweep.length, trace.length - lag);
      for (let sample = start; sample < end; sample += 1) sum += (trace[sample + lag] ?? 0) * (this.sweep[sample] ?? 0);
      full[lag + this.sweep.length - 1] = sum;
    }
    return full;
  }

  private fft(trace: Float32Array): Float64Array {
    const outputLength = trace.length + this.sweep.length - 1; const count = Radix2Fft.nextPowerOfTwo(outputLength);
    const scratch = this.scratch(count); const traceReal = scratch.real; const traceImaginary = scratch.imaginary;
    traceReal.fill(0); traceImaginary.fill(0);
    for (let index = 0; index < trace.length; index += 1) traceReal[index] = trace[index] ?? 0;
    Radix2Fft.transform(traceReal, traceImaginary);
    const spectrum = this.sweepSpectrum(count);
    for (let index = 0; index < count; index += 1) { const ar = traceReal[index] ?? 0; const ai = traceImaginary[index] ?? 0; const br = spectrum.real[index] ?? 0; const bi = spectrum.imaginary[index] ?? 0; traceReal[index] = ar * br - ai * bi; traceImaginary[index] = ar * bi + ai * br; }
    Radix2Fft.transform(traceReal, traceImaginary, true);
    return traceReal.slice(0, outputLength);
  }

  private scratch(count: number): { readonly real: Float64Array; readonly imaginary: Float64Array } {
    const cached = this.fftScratch.get(count);
    if (cached) return cached;
    if (this.fftScratch.size >= 4) this.fftScratch.clear();
    const created = { real: new Float64Array(count), imaginary: new Float64Array(count) };
    this.fftScratch.set(count, created);
    return created;
  }

  private sweepSpectrum(count: number): { readonly real: Float64Array; readonly imaginary: Float64Array } {
    const cached = this.spectrum.get(count); if (cached) return cached;
    const real = new Float64Array(count); const imaginary = new Float64Array(count);
    for (let index = 0; index < this.sweep.length; index += 1) real[index] = this.sweep[this.sweep.length - 1 - index] ?? 0;
    Radix2Fft.transform(real, imaginary); const created = { real, imaginary }; this.spectrum.set(count, created); return created;
  }

  private normalize(full: Float64Array, trace: Float32Array, sweep: Float32Array): void {
    if (this.options.normalization === "none") return;
    let sweepEnergy = 0; let traceEnergy = 0; for (let index = 0; index < sweep.length; index += 1) sweepEnergy += (sweep[index] ?? 0) ** 2; for (let index = 0; index < trace.length; index += 1) traceEnergy += (trace[index] ?? 0) ** 2;
    if (sweepEnergy <= Number.EPSILON) { full.fill(0); return; }
    if (this.options.normalization === "sweep-energy") { for (let index = 0; index < full.length; index += 1) full[index] = (full[index] ?? 0) / sweepEnergy; return; }
    if (this.options.normalization === "global-coefficient") { const scale = Math.sqrt(sweepEnergy * traceEnergy); if (scale > Number.EPSILON) for (let index = 0; index < full.length; index += 1) full[index] = (full[index] ?? 0) / scale; else full.fill(0); return; }
    const prefix = new Float64Array(trace.length + 1); const sweepPrefix = new Float64Array(sweep.length + 1);
    for (let index = 0; index < trace.length; index += 1) prefix[index + 1] = (prefix[index] ?? 0) + (trace[index] ?? 0) ** 2;
    for (let index = 0; index < sweep.length; index += 1) sweepPrefix[index + 1] = (sweepPrefix[index] ?? 0) + (sweep[index] ?? 0) ** 2;
    for (let index = 0; index < full.length; index += 1) { const lag = index - (sweep.length - 1); const start = Math.max(0, -lag); const end = Math.min(sweep.length, trace.length - lag); const traceStart = start + lag; const traceEnd = end + lag; const energy = ((prefix[traceEnd] ?? 0) - (prefix[traceStart] ?? 0)) * ((sweepPrefix[end] ?? 0) - (sweepPrefix[start] ?? 0)); const scale = Math.sqrt(Math.max(0, energy)); full[index] = scale > Number.EPSILON ? (full[index] ?? 0) / scale : 0; }
  }
}
