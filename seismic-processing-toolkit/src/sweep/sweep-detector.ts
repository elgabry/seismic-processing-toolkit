import type { SegyDataset } from "../io/segy/segy-dataset";
import type { SweepSignal } from "./sweep-signal";

export interface SweepCandidate { readonly traceId: number; readonly score: number; readonly reasons: readonly string[]; readonly sampleIntervalSeconds: number; }

/** Ranks evidence; it never silently chooses a pilot based solely on a file name. */
export class SweepDetector {
  public static fromDataset(dataset: SegyDataset): readonly SweepCandidate[] {
    const candidates: SweepCandidate[] = [];
    for (let traceId = 0; traceId < dataset.traceCount; traceId += 1) {
      let score = 0; const reasons: string[] = [];
      const id = dataset.traceIndex.traceIdentificationCodes[traceId] ?? 0;
      if (id === 6) { score += 60; reasons.push("trace identification code is Sweep (6)"); }
      const count = dataset.traceIndex.sampleCounts[traceId] ?? 0;
      if (count > 16) { score += 5; reasons.push("contains a nontrivial waveform"); }
      const interval = (dataset.traceIndex.sampleIntervalsMicroseconds[traceId] ?? 0) / 1_000_000;
      if (interval > 0) score += 5;
      if (score > 0) candidates.push({ traceId, score, reasons, sampleIntervalSeconds: interval });
    }
    return candidates.sort((left, right) => right.score - left.score || left.traceId - right.traceId);
  }

  public static qc(signal: SweepSignal): Readonly<Record<string, number>> {
    let sum = 0; let sumSquares = 0; let peak = 0; let clipped = 0;
    for (let index = 0; index < signal.samples.length; index += 1) { const value = signal.samples[index] ?? 0; sum += value; sumSquares += value * value; peak = Math.max(peak, Math.abs(value)); }
    for (let index = 0; index < signal.samples.length; index += 1) if (Math.abs(signal.samples[index] ?? 0) >= peak * 0.999) clipped += 1;
    return { dcLevel: sum / Math.max(1, signal.samples.length), rms: Math.sqrt(sumSquares / Math.max(1, signal.samples.length)), peak, clippingFraction: clipped / Math.max(1, signal.samples.length), durationSeconds: signal.samples.length * signal.sampleIntervalSeconds };
  }
}
