import { describe, expect, it } from "vitest";
import { defaultSampleCodecRegistry } from "../../src/io/segy/codecs/sample-codec-registry";
import { SegyTraceIndexBuilder } from "../../src/io/segy/index/segy-trace-index-builder";
import type { RandomAccessSource } from "../../src/io/source/random-access-source";

const dataStartOffset = 3600;
const traceBytes = 244;

/** Virtual fixed-length file: it synthesizes requested bytes instead of retaining a file-sized buffer. */
class VirtualSegySource implements RandomAccessSource {
  public readonly name = "virtual-large.segy";
  public readonly requests: { readonly offset: number; readonly length: number }[] = [];

  public constructor(public readonly size: number, private readonly afterRead?: () => void) {}

  public async read(offset: number, length: number, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (offset < 0 || length < 0 || offset + length > this.size) throw new RangeError("virtual range outside file");
    this.requests.push({ offset, length });
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    for (let local = 0; local + 240 <= length; local += 1) {
      const absolute = offset + local;
      if (absolute >= dataStartOffset && (absolute - dataStartOffset) % traceBytes === 0) {
        view.setUint16(local + 114, 1, false);
        view.setUint16(local + 116, 1000, false);
      }
    }
    this.afterRead?.();
    await Promise.resolve();
    return buffer;
  }
}

const buildOptions = { dataStartOffset, nominalSamplesPerTrace: 1, nominalSampleIntervalMicroseconds: 1000, revision: 1 as const, littleEndian: false, readWindowBytes: 4096 };

describe("SegyTraceIndexBuilder bounded access", () => {
  it("computes fixed trace offsets without sample-sized allocations or per-trace reads", async () => {
    const source = new VirtualSegySource(dataStartOffset + traceBytes * 12);
    const { index } = await SegyTraceIndexBuilder.build(source, defaultSampleCodecRegistry.get(5), buildOptions);
    expect(index.traceCount).toBe(12);
    expect(index.headerOffsets).toEqual(new Float64Array(Array.from({ length: 12 }, (_, index) => dataStartOffset + index * traceBytes)));
    expect(index.sampleDataOffsets[11]).toBe(dataStartOffset + 11 * traceBytes + 240);
    expect(Math.max(...source.requests.map((request) => request.length))).toBeLessThanOrEqual(4096);
    expect(source.requests.length).toBeLessThan(3);
  });

  it("cancels a very large virtual index before file-size-proportional work", async () => {
    const controller = new AbortController();
    const source = new VirtualSegySource(2 ** 34, () => controller.abort());
    await expect(SegyTraceIndexBuilder.build(source, defaultSampleCodecRegistry.get(5), { ...buildOptions, signal: controller.signal })).rejects.toThrow(/cancelled/i);
    expect(source.requests).toHaveLength(1);
    expect(source.requests[0]?.length).toBe(4096);
  });
});
