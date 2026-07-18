import type { RandomAccessSource } from "./random-access-source";

interface CachedRange { readonly offset: number; readonly data: ArrayBuffer; usedAt: number; }

/** Small byte-limited LRU for header and nearby trace reads. */
export class CachedSource implements RandomAccessSource {
  private readonly entries: CachedRange[] = [];
  private cachedBytes = 0;
  private clock = 0;

  public readonly name: string;
  public readonly size: number;

  public constructor(private readonly source: RandomAccessSource, private readonly capacityBytes = 8 * 1024 * 1024) {
    if (!Number.isSafeInteger(capacityBytes) || capacityBytes < 0) throw new RangeError("capacityBytes must be a non-negative safe integer.");
    this.name = source.name;
    this.size = source.size;
  }

  public async read(offset: number, length: number, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > this.size) throw new RangeError("Cached source request is outside the source range.");
    for (const entry of this.entries) {
      if (offset >= entry.offset && offset + length <= entry.offset + entry.data.byteLength) {
        entry.usedAt = ++this.clock;
        return entry.data.slice(offset - entry.offset, offset - entry.offset + length);
      }
    }
    const data = await this.source.read(offset, length, signal);
    if (data.byteLength <= this.capacityBytes) this.insert({ offset, data: data.slice(0), usedAt: ++this.clock });
    return data;
  }

  public dispose(): void { this.entries.length = 0; this.cachedBytes = 0; }

  private insert(entry: CachedRange): void {
    while (this.cachedBytes + entry.data.byteLength > this.capacityBytes && this.entries.length > 0) {
      let oldestIndex = 0;
      for (let index = 1; index < this.entries.length; index += 1) {
        if ((this.entries[index]?.usedAt ?? Infinity) < (this.entries[oldestIndex]?.usedAt ?? Infinity)) oldestIndex = index;
      }
      const [removed] = this.entries.splice(oldestIndex, 1);
      if (removed) this.cachedBytes -= removed.data.byteLength;
    }
    this.entries.push(entry);
    this.cachedBytes += entry.data.byteLength;
  }
}
