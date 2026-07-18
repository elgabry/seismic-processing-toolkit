import type { SweepSignal } from "./sweep-signal";

export interface SweepGenerationParameters {
  readonly name?: string;
  readonly startFrequencyHz: number;
  readonly endFrequencyHz: number;
  readonly durationSeconds: number;
  readonly sampleIntervalSeconds: number;
  readonly type: "linear" | "logarithmic";
  readonly taperStartSeconds?: number;
  readonly taperEndSeconds?: number;
  readonly initialPhaseRadians?: number;
}

/** Generates a phase-continuous linear or logarithmic vibroseis pilot. */
export class SweepGenerator {
  public static generate(parameters: SweepGenerationParameters): SweepSignal {
    const { startFrequencyHz: f0, endFrequencyHz: f1, durationSeconds: duration, sampleIntervalSeconds: dt } = parameters;
    if (!(f0 > 0) || !(f1 > 0) || !(duration > 0) || !(dt > 0)) throw new RangeError("Sweep frequencies, duration, and sample interval must be positive.");
    if (parameters.type === "logarithmic" && f0 === f1) throw new RangeError("A logarithmic sweep requires different start and end frequencies.");
    const count = Math.max(2, Math.floor(duration / dt) + 1);
    const samples = new Float32Array(count); const phase = parameters.initialPhaseRadians ?? 0;
    for (let index = 0; index < count; index += 1) {
      const time = Math.min(index * dt, duration);
      const argument = parameters.type === "linear"
        ? 2 * Math.PI * (f0 * time + (f1 - f0) * time * time / (2 * duration)) + phase
        : 2 * Math.PI * f0 * duration / Math.log(f1 / f0) * (Math.pow(f1 / f0, time / duration) - 1) + phase;
      samples[index] = Math.sin(argument);
    }
    this.taper(samples, Math.round((parameters.taperStartSeconds ?? 0) / dt), Math.round((parameters.taperEndSeconds ?? 0) / dt));
    return { id: crypto.randomUUID(), name: parameters.name ?? "generated-sweep", samples, sampleIntervalSeconds: dt, startTimeSeconds: 0, units: "counts", source: "generated", metadata: { startFrequencyHz: f0, endFrequencyHz: f1, durationSeconds: duration, type: parameters.type } };
  }

  private static taper(samples: Float32Array, startCount: number, endCount: number): void {
    const start = Math.min(Math.floor(samples.length / 2), Math.max(0, startCount));
    const end = Math.min(Math.floor(samples.length / 2), Math.max(0, endCount));
    for (let index = 0; index < start; index += 1) samples[index] = (samples[index] ?? 0) * 0.5 * (1 - Math.cos(Math.PI * index / Math.max(1, start)));
    for (let index = 0; index < end; index += 1) { const target = samples.length - 1 - index; samples[target] = (samples[target] ?? 0) * 0.5 * (1 - Math.cos(Math.PI * index / Math.max(1, end))); }
  }
}
