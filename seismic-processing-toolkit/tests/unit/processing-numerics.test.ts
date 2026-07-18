import { describe, expect, it } from "vitest";
import { emptyTraceHeaders, type TraceBlock } from "../../src/core/model/trace";
import { FilterProcessor } from "../../src/processing/filters/filter-processor";
import { ResamplingProcessor } from "../../src/processing/resampling/resampler";

const context = { signal: new AbortController().signal, reportProgress: () => undefined, diagnostics: { add: () => undefined }, execution: "main" as const, memoryBudgetBytes: 1_000_000 };

function traceBlock(samples: Float32Array, dt = 0.001): TraceBlock { return { traceIds: new Uint32Array([0]), sampleOffsets: new Uint32Array([0, samples.length]), samples, sampleIntervalSeconds: dt, headers: emptyTraceHeaders() }; }
function rms(samples: Float32Array, start = 0): number { let sum = 0; let count = 0; for (let index = start; index < samples.length; index += 1) { sum += (samples[index] ?? 0) ** 2; count += 1; } return Math.sqrt(sum / Math.max(1, count)); }

describe("filter and resampling numerical behaviour", () => {
  it("attenuates out-of-band low-pass and high-pass components", async () => {
    const mixed = new Float32Array(4096);
    const low = new Float32Array(4096);
    const high = new Float32Array(4096);
    for (let index = 0; index < mixed.length; index += 1) { low[index] = Math.sin(2 * Math.PI * 15 * index * 0.001); high[index] = Math.sin(2 * Math.PI * 180 * index * 0.001); mixed[index] = (low[index] ?? 0) + (high[index] ?? 0); }
    const filter = new FilterProcessor();
    const lowPass = await filter.processBlock(traceBlock(mixed), { mode: "lowpass", highFrequencyHz: 45, zeroPhase: false }, context);
    const highPass = await filter.processBlock(traceBlock(mixed), { mode: "highpass", lowFrequencyHz: 80, zeroPhase: false }, context);
    const bandPass = await filter.processBlock(traceBlock(mixed), { mode: "bandpass", lowFrequencyHz: 8, highFrequencyHz: 45, zeroPhase: false }, context);
    expect(rms(lowPass.samples, 512)).toBeLessThan(rms(mixed, 512));
    expect(rms(highPass.samples, 512)).toBeLessThan(rms(mixed, 512));
    expect(rms(lowPass.samples, 512)).toBeGreaterThan(0.45);
    expect(rms(highPass.samples, 512)).toBeGreaterThan(0.45);
    expect(rms(bandPass.samples, 512)).toBeGreaterThan(0.4);
  });

  it("notches the selected frequency and validates invalid band-pass settings", async () => {
    const tone = new Float32Array(4096);
    for (let index = 0; index < tone.length; index += 1) tone[index] = Math.sin(2 * Math.PI * 50 * index * 0.001);
    const filter = new FilterProcessor();
    const notched = await filter.processBlock(traceBlock(tone), { mode: "notch", lowFrequencyHz: 50, quality: 8, zeroPhase: false }, context);
    expect(rms(notched.samples, 512)).toBeLessThan(rms(tone, 512) * 0.2);
    expect(filter.validate({ traceCount: 1, maximumSamplesPerTrace: 100, sampleIntervalSeconds: 0.001 }, { mode: "bandpass", lowFrequencyHz: 100, highFrequencyHz: 50 })).not.toHaveLength(0);
  });

  it("anti-aliases before decimation while preserving the time origin and metadata", async () => {
    const high = new Float32Array(4096);
    for (let index = 0; index < high.length; index += 1) high[index] = Math.sin(2 * Math.PI * 310 * index * 0.001);
    const resampler = new ResamplingProcessor();
    const decimated = resampler.resample(high, 0.001, 0.002, 24);
    expect(rms(decimated, 64)).toBeLessThan(0.25);
    const impulse = resampler.resample(new Float32Array([1, 0, 0, 0]), 0.001, 0.0005, 12);
    expect(impulse[0]).toBeCloseTo(1, 6);
    const output = await resampler.processBlock(traceBlock(new Float32Array([1, 0, 0, 0])), { targetSampleIntervalSeconds: 0.002, halfKernelSamples: 8 }, context);
    expect(output.sampleIntervalSeconds).toBe(0.002);
    expect(output.samples[0]).toBeCloseTo(1, 6);
  });

  it("rejects invalid resampler parameters and honours cancellation", async () => {
    const resampler = new ResamplingProcessor();
    expect(() => resampler.resample(new Float32Array([1]), 0, 0.001, 8)).toThrow(/positive/i);
    const controller = new AbortController(); controller.abort();
    await expect(resampler.processBlock(traceBlock(new Float32Array([1, 2])), { targetSampleIntervalSeconds: 0.002 }, { ...context, signal: controller.signal })).rejects.toThrow(/cancelled/i);
  });
});
