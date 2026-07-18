import { describe, expect, it } from "vitest";
import { CorrelationPlan } from "../../src/processing/vibroseis/correlation";
import { emptyTraceHeaders } from "../../src/core/model/trace";
import type { SweepSignal } from "../../src/sweep/sweep-signal";
const sweep: SweepSignal = { id: "s", name: "s", samples: new Float32Array([1, 2, 1]), sampleIntervalSeconds: 0.001, startTimeSeconds: 0, units: "counts", source: "generated", metadata: {} };
const options = { output: "same" as const, algorithm: "direct" as const, removeTraceMean: false, removeSweepMean: false, sweepTaperFraction: 0, normalization: "none" as const };
describe("CorrelationPlan", () => {
  it("places delayed sweep peak at delay sample in same output", () => { const trace = new Float32Array([0, 0, 1, 2, 1, 0]); const result = CorrelationPlan.create(sweep, options).correlateTrace(trace, 0.001); expect(result.samples.indexOf(Math.max(...result.samples))).toBe(2); expect(result.firstLagSamples).toBe(0); });
  it("matches direct and FFT for non-power-of-two lengths", () => { const trace = Float32Array.from({ length: 19 }, (_, index) => Math.sin(index * 0.3)); const direct = CorrelationPlan.create(sweep, { ...options, output: "full", algorithm: "direct" }).correlateTrace(trace, 0.001); const fft = CorrelationPlan.create(sweep, { ...options, output: "full", algorithm: "fft" }).correlateTrace(trace, 0.001); expect(fft.samples).toHaveLength(direct.samples.length); for (let index = 0; index < direct.samples.length; index += 1) expect(fft.samples[index] ?? 0).toBeCloseTo(direct.samples[index] ?? 0, 5); });
  it("handles longer sweeps and non-finite samples", () => { const long = { ...sweep, samples: new Float32Array([1, 1, 1, 1, 1]) }; const result = CorrelationPlan.create(long, { ...options, normalization: "local-coefficient" }).correlateTrace(new Float32Array([NaN, 1]), 0.001); expect(result.samples).toHaveLength(2); expect(result.nonFiniteInputCount).toBe(1); expect([...result.samples].every(Number.isFinite)).toBe(true); });
  it("matches direct and FFT across output and normalization modes", () => {
    let state = 0x12345678;
    const random = (count: number): Float32Array => {
      const values = new Float32Array(count);
      for (let index = 0; index < count; index += 1) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; values[index] = state / 0xffffffff * 2 - 1; }
      return values;
    };
    const trace = random(37);
    const oddSweep = { ...sweep, samples: random(8) };
    for (const output of ["full", "same", "valid"] as const) for (const normalization of ["none", "sweep-energy", "global-coefficient", "local-coefficient"] as const) {
      const direct = CorrelationPlan.create(oddSweep, { ...options, output, normalization, algorithm: "direct" }).correlateTrace(trace, 0.001).samples;
      const fft = CorrelationPlan.create(oddSweep, { ...options, output, normalization, algorithm: "fft" }).correlateTrace(trace, 0.001).samples;
      expect(fft).toHaveLength(direct.length);
      let squaredError = 0; let squaredSignal = 0;
      for (let index = 0; index < direct.length; index += 1) { const difference = (fft[index] ?? 0) - (direct[index] ?? 0); squaredError += difference * difference; squaredSignal += (direct[index] ?? 0) ** 2; expect(Math.abs(difference)).toBeLessThan(2e-5); }
      expect(Math.sqrt(squaredError / Math.max(squaredSignal, Number.EPSILON))).toBeLessThan(2e-6);
    }
  });
  it("handles one-sample sweeps, negative polarity, and variable-length blocks", () => {
    const impulseSweep = { ...sweep, samples: new Float32Array([1]) };
    const one = CorrelationPlan.create(impulseSweep, options).correlateTrace(new Float32Array([2, -3]), 0.001);
    expect(one.samples).toEqual(new Float32Array([2, -3]));
    const negative = { ...sweep, samples: new Float32Array([-1, -2, -1]) };
    const negativeResult = CorrelationPlan.create(negative, options).correlateTrace(new Float32Array([0, 1, 2, 1]), 0.001);
    expect(Math.min(...negativeResult.samples)).toBeLessThan(-5);
    const block = { traceIds: new Uint32Array([2, 4]), sampleOffsets: new Uint32Array([0, 4, 6]), samples: new Float32Array([0, 1, 2, 1, 1, 2]), sampleIntervalSeconds: 0.001, headers: emptyTraceHeaders() };
    const result = CorrelationPlan.create(sweep, options).correlateBlock(block);
    expect(result.sampleOffsets).toEqual(new Uint32Array([0, 4, 6]));
    expect(result.traceIds).toEqual(block.traceIds);
  });
  it("supports cooperative cancellation between traces", () => { const block = { traceIds: new Uint32Array([0]), sampleOffsets: new Uint32Array([0, 3]), samples: new Float32Array([1, 2, 3]), sampleIntervalSeconds: 0.001, headers: emptyTraceHeaders() }; const plan = CorrelationPlan.create(sweep, options); expect(() => plan.correlateBlock(block, () => true)).toThrow(/cancelled/i); });
});
