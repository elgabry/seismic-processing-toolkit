import { describe, expect, it } from "vitest";
import { FdSweepDeconvolutionPlan } from "../../src/processing/vibroseis/fd-sweep-deconvolution";
import type { SweepSignal } from "../../src/sweep/sweep-signal";

const sweep: SweepSignal = { id: "pilot", name: "pilot", samples: new Float32Array([1, 0.5]), sampleIntervalSeconds: 0.001, startTimeSeconds: 0, units: "counts", source: "generated", metadata: {} };

function convolve(left: Float32Array, right: Float32Array): Float32Array {
  const output = new Float32Array(left.length + right.length - 1);
  for (let i = 0; i < left.length; i += 1) for (let j = 0; j < right.length; j += 1) output[i + j] = (output[i + j] ?? 0) + (left[i] ?? 0) * (right[j] ?? 0);
  return output;
}

describe("FdSweepDeconvolutionPlan", () => {
  it("recovers a reflection sequence by stabilized complex spectral division", () => {
    const reflectivity = new Float32Array([0, 1, -0.4, 0.25]);
    const recorded = convolve(reflectivity, sweep.samples);
    const plan = FdSweepDeconvolutionPlan.create(sweep, { waterLevelFraction: 1e-9, removeTraceMean: false, removeSweepMean: false });
    const result = plan.deconvolveTrace(recorded, 0.001);
    for (let index = 0; index < reflectivity.length; index += 1) expect(result.samples[index] ?? 0).toBeCloseTo(reflectivity[index] ?? 0, 5);
    expect(result.samples).toHaveLength(recorded.length);
    plan.dispose();
  });

  it("rejects mismatched intervals and invalid stabilization", () => {
    const plan = FdSweepDeconvolutionPlan.create(sweep, { waterLevelFraction: 0.01 });
    expect(() => plan.deconvolveTrace(new Float32Array([1, 2]), 0.002)).toThrow(/matching trace and sweep/i);
    expect(() => FdSweepDeconvolutionPlan.create(sweep, { waterLevelFraction: 0 })).toThrow(/water level/i);
    plan.dispose();
  });

  it("uses a finite, fixed-length output for non-finite input samples", () => {
    const plan = FdSweepDeconvolutionPlan.create(sweep, { waterLevelFraction: 0.01 });
    const result = plan.deconvolveTrace(new Float32Array([NaN, 1, Infinity]), 0.001);
    expect(result.samples).toHaveLength(3);
    expect(result.nonFiniteInputCount).toBe(2);
    expect([...result.samples].every(Number.isFinite)).toBe(true);
    plan.dispose();
  });
});
