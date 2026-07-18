import { emptyTraceHeaders, type TraceBlock, type TraceHeaderTableView } from "../../core/model/trace";
import { throwIfAborted } from "../../core/errors/errors";
import type { RandomAccessSource } from "../source/random-access-source";
import type { SampleCodec } from "./codecs/sample-codec";
import { TraceHeader } from "./headers/trace-header";
import type { SegyTraceIndex } from "./index/segy-trace-index";

interface CachedTrace { readonly samples: Float32Array; usedAt: number; }

/** Lazy, byte-capped decoder. Reads only the trace samples requested by a consumer. */
export class SegyTraceAccessor {
  private readonly cache = new Map<number, CachedTrace>();
  private cacheBytes = 0;
  private clock = 0;

  public constructor(private readonly source: RandomAccessSource, private readonly index: SegyTraceIndex, private readonly codec: SampleCodec, private readonly littleEndian: boolean, private readonly cacheCapacityBytes = 64 * 1024 * 1024) {}

  public async readTrace(traceId: number, signal?: AbortSignal): Promise<Float32Array> {
    this.requireTrace(traceId);
    const cached = this.cache.get(traceId);
    if (cached) { cached.usedAt = ++this.clock; return cached.samples; }
    throwIfAborted(signal, "Trace decode");
    const samples = await this.decode(traceId, signal);
    this.insert(traceId, samples);
    return samples;
  }

  public async readHeader(traceId: number, signal?: AbortSignal): Promise<TraceHeader> {
    this.requireTrace(traceId);
    const bytes = await this.source.read(this.index.headerOffsets[traceId] ?? 0, 240, signal);
    return new TraceHeader(bytes, this.littleEndian);
  }

  public async readHeaders(traceIds: Uint32Array, fieldIds: readonly string[], signal?: AbortSignal): Promise<TraceHeaderTableView> {
    const values = new Map<string, Float64Array>();
    for (const fieldId of fieldIds) values.set(fieldId, new Float64Array(traceIds.length));
    for (let row = 0; row < traceIds.length; row += 1) {
      throwIfAborted(signal, "Trace header read");
      const header = await this.readHeader(traceIds[row] ?? 0, signal);
      for (const fieldId of fieldIds) { const destination = values.get(fieldId); if (destination) destination[row] = header.raw(fieldId); }
    }
    return { fieldIds, values };
  }

  public async readRange(firstTraceId: number, count: number, signal?: AbortSignal): Promise<readonly Float32Array[]> {
    if (!Number.isInteger(firstTraceId) || !Number.isInteger(count) || count < 0 || firstTraceId < 0 || firstTraceId + count > this.index.traceCount) throw new RangeError("Requested trace range is outside the index.");
    const result: Float32Array[] = [];
    for (let traceId = firstTraceId; traceId < firstTraceId + count; traceId += 1) result.push(await this.readTrace(traceId, signal));
    return result;
  }

  public async readBlock(traceIds: Uint32Array, fieldIds: readonly string[] = [], signal?: AbortSignal): Promise<TraceBlock> {
    let totalSamples = 0;
    for (let row = 0; row < traceIds.length; row += 1) {
      const traceId = traceIds[row] ?? -1;
      this.requireTrace(traceId);
      totalSamples += this.index.sampleCounts[traceId] ?? 0;
    }
    if (totalSamples > 0xffffffff) throw new RangeError("TraceBlock sample offsets exceed Uint32 capacity; split the requested block.");
    const offsets = new Uint32Array(traceIds.length + 1);
    const samples = new Float32Array(totalSamples);
    let writeOffset = 0;
    for (let row = 0; row < traceIds.length; row += 1) {
      const traceId = traceIds[row] ?? 0;
      offsets[row] = writeOffset;
      const decoded = await this.readTrace(traceId, signal);
      samples.set(decoded, writeOffset);
      writeOffset += decoded.length;
    }
    offsets[traceIds.length] = writeOffset;
    const headers = fieldIds.length === 0 ? emptyTraceHeaders() : await this.readHeaders(traceIds, fieldIds, signal);
    const interval = traceIds.length === 0 ? 0 : (this.index.sampleIntervalsMicroseconds[traceIds[0] ?? 0] ?? 0) / 1_000_000;
    return { traceIds: traceIds.slice(), sampleOffsets: offsets, samples, sampleIntervalSeconds: interval, headers };
  }

  public dispose(): void { this.cache.clear(); this.cacheBytes = 0; }

  private async decode(traceId: number, signal?: AbortSignal): Promise<Float32Array> {
    const sampleCount = this.index.sampleCounts[traceId] ?? 0;
    const sampleOffset = this.index.sampleDataOffsets[traceId] ?? 0;
    const data = await this.source.read(sampleOffset, sampleCount * this.codec.bytesPerSample, signal);
    throwIfAborted(signal, "Trace decode");
    const output = new Float32Array(sampleCount);
    this.codec.decode(new DataView(data), 0, sampleCount, this.littleEndian, output);
    return output;
  }

  private requireTrace(traceId: number): void {
    if (!Number.isInteger(traceId) || traceId < 0 || traceId >= this.index.traceCount) throw new RangeError(`Trace ${traceId} is outside the index.`);
  }

  private insert(traceId: number, samples: Float32Array): void {
    const bytes = samples.byteLength;
    if (bytes > this.cacheCapacityBytes) return;
    while (this.cacheBytes + bytes > this.cacheCapacityBytes && this.cache.size > 0) {
      let oldestId = -1; let oldestUse = Infinity;
      for (const [id, entry] of this.cache) if (entry.usedAt < oldestUse) { oldestId = id; oldestUse = entry.usedAt; }
      const oldest = this.cache.get(oldestId);
      if (!oldest) break;
      this.cache.delete(oldestId); this.cacheBytes -= oldest.samples.byteLength;
    }
    this.cache.set(traceId, { samples, usedAt: ++this.clock }); this.cacheBytes += bytes;
  }
}
