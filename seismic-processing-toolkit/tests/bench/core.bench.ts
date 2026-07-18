import { bench, describe } from "vitest";
import { defaultSampleCodecRegistry } from "../../src/io/segy/codecs/sample-codec-registry";
import { CorrelationPlan } from "../../src/processing/vibroseis/correlation";
import type { SweepSignal } from "../../src/sweep/sweep-signal";

const samples = Float32Array.from({ length: 8192 }, (_, index) => Math.sin(index * 0.03));
const sweep: SweepSignal = { id: "bench", name: "bench", samples: samples.subarray(0, 1024), sampleIntervalSeconds: 0.001, startTimeSeconds: 0, units: "counts", source: "generated", metadata: {} };
describe("core throughput", () => {
  bench("IEEE float decode", () => { const buffer = new ArrayBuffer(samples.byteLength); new Float32Array(buffer).set(samples); defaultSampleCodecRegistry.get(5).decode(new DataView(buffer), 0, samples.length, true, new Float32Array(samples.length)); });
  bench("FFT correlation", () => { const plan = CorrelationPlan.create(sweep, { output: "same", algorithm: "fft", removeTraceMean: true, removeSweepMean: true, sweepTaperFraction: 0, normalization: "sweep-energy" }); plan.correlateTrace(samples, 0.001); plan.dispose(); });
});
