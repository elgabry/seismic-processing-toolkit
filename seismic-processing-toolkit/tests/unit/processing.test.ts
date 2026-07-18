import { describe, expect, it } from "vitest";
import { GainProcessor } from "../../src/processing/gain/gain-processors";
import { ResamplingProcessor } from "../../src/processing/resampling/resampler";
import { emptyTraceHeaders, type TraceBlock } from "../../src/core/model/trace";
const context = { signal: new AbortController().signal, reportProgress: () => undefined, diagnostics: { add: () => undefined }, execution: "main" as const, memoryBudgetBytes: 1_000_000 };
const block: TraceBlock = { traceIds: new Uint32Array([0]), sampleOffsets: new Uint32Array([0, 4]), samples: new Float32Array([1, 1, 1, 1]), sampleIntervalSeconds: 0.001, headers: emptyTraceHeaders() };
describe("Phase 1 processors", () => { it("applies constant gain", async () => { const out = await new GainProcessor().processBlock(block, { mode: "constant", factor: 2 }, context); expect(out.samples).toEqual(new Float32Array([2, 2, 2, 2])); }); it("resamples with anti-alias windowed sinc kernel", () => { const out = new ResamplingProcessor().resample(new Float32Array([0, 1, 0, -1, 0]), 0.001, 0.002, 8); expect(out).toHaveLength(3); expect([...out].every(Number.isFinite)).toBe(true); }); });
