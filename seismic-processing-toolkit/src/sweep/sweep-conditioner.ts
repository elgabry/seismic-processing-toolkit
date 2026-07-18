import type { SweepSignal } from "./sweep-signal";

export interface SweepConditioningParameters {
  readonly removeDc?: boolean;
  readonly linearDetrend?: boolean;
  readonly taperFraction?: number;
  readonly reversePolarity?: boolean;
  readonly startSample?: number;
  readonly endSampleExclusive?: number;
  readonly normalization?: "none" | "peak" | "rms" | "energy";
  readonly whiteningStabilization?: number;
}

/** Produces a derivative signal and records every conditioning decision in metadata. */
export class SweepConditioner {
  public static condition(input: SweepSignal, parameters: SweepConditioningParameters = {}): SweepSignal {
    const start = Math.max(0, parameters.startSample ?? 0);
    const end = Math.min(input.samples.length, parameters.endSampleExclusive ?? input.samples.length);
    if (end <= start) throw new RangeError("Sweep conditioning window is empty.");
    const samples = input.samples.slice(start, end);
    if (parameters.removeDc ?? true) this.removeMean(samples);
    if (parameters.linearDetrend ?? false) this.detrend(samples);
    const taperCount = Math.floor(samples.length * Math.max(0, Math.min(0.5, parameters.taperFraction ?? 0)));
    for (let index = 0; index < taperCount; index += 1) {
      const weight = 0.5 * (1 - Math.cos(Math.PI * index / Math.max(1, taperCount)));
      samples[index] = (samples[index] ?? 0) * weight; const tail = samples.length - 1 - index; samples[tail] = (samples[tail] ?? 0) * weight;
    }
    if (parameters.reversePolarity ?? false) for (let index = 0; index < samples.length; index += 1) samples[index] = -(samples[index] ?? 0);
    if (parameters.whiteningStabilization !== undefined) this.whiten(samples, parameters.whiteningStabilization);
    this.normalize(samples, parameters.normalization ?? "energy");
    return { ...input, id: crypto.randomUUID(), name: `${input.name} (conditioned)`, samples, startTimeSeconds: input.startTimeSeconds + start * input.sampleIntervalSeconds, metadata: { ...input.metadata, conditioning: JSON.stringify(parameters) } };
  }

  private static removeMean(samples: Float32Array): void { let sum = 0; for (let index = 0; index < samples.length; index += 1) sum += samples[index] ?? 0; const mean = sum / samples.length; for (let index = 0; index < samples.length; index += 1) samples[index] = (samples[index] ?? 0) - mean; }
  private static detrend(samples: Float32Array): void {
    let sumX = 0; let sumY = 0; let sumXX = 0; let sumXY = 0;
    for (let index = 0; index < samples.length; index += 1) { const value = samples[index] ?? 0; sumX += index; sumY += value; sumXX += index * index; sumXY += index * value; }
    const denominator = samples.length * sumXX - sumX * sumX; const slope = denominator === 0 ? 0 : (samples.length * sumXY - sumX * sumY) / denominator; const intercept = (sumY - slope * sumX) / samples.length;
    for (let index = 0; index < samples.length; index += 1) samples[index] = (samples[index] ?? 0) - intercept - slope * index;
  }
  private static normalize(samples: Float32Array, mode: NonNullable<SweepConditioningParameters["normalization"]>): void {
    if (mode === "none") return;
    let sum = 0; let peak = 0;
    for (let index = 0; index < samples.length; index += 1) { const value = samples[index] ?? 0; sum += value * value; peak = Math.max(peak, Math.abs(value)); }
    const scale = mode === "peak" ? peak : mode === "rms" ? Math.sqrt(sum / Math.max(1, samples.length)) : Math.sqrt(sum);
    if (scale > Number.EPSILON) for (let index = 0; index < samples.length; index += 1) samples[index] = (samples[index] ?? 0) / scale;
  }
  /** Lightweight one-pole pre-emphasis; stabilization bounds high-frequency amplification. */
  private static whiten(samples: Float32Array, stabilization: number): void {
    const alpha = Math.max(0, Math.min(1, stabilization)); let previous = samples[0] ?? 0;
    for (let index = 1; index < samples.length; index += 1) { const current = samples[index] ?? 0; samples[index] = current - (1 - alpha) * previous; previous = current; }
  }
}
