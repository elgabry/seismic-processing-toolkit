import { SegyTruncationError } from "../../core/errors/errors";
import type { RandomAccessSource } from "./random-access-source";

/** Uses Blob.slice so opening a multi-gigabyte file never reads it as one ArrayBuffer. */
export class BlobSource implements RandomAccessSource {
  public readonly name: string;
  public readonly size: number;

  public constructor(private readonly blob: Blob) {
    this.name = blob instanceof File ? blob.name : "unnamed.segy";
    this.size = blob.size;
  }

  public async read(offset: number, length: number, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > this.size) {
      throw new SegyTruncationError("Requested SEG-Y byte range is outside the source.", {
        severity: "error", code: "SOURCE_RANGE", message: `Requested ${offset}+${length} from ${this.name} (${this.size} bytes).`,
        fileName: this.name, byteOffset: offset, recoverable: false
      });
    }
    const result = await this.blob.slice(offset, offset + length).arrayBuffer();
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    return result;
  }
}
