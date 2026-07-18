import { SweepFormatError } from "../../core/errors/errors";
import { BlobSource } from "../source/blob-source";
import type { RandomAccessSource } from "../source/random-access-source";

export interface TarEntry { readonly name: string; readonly type: "file" | "directory" | "unsupported"; readonly byteOffset: number; readonly size: number; }

function string(bytes: Uint8Array): string { let end = 0; while (end < bytes.length && bytes[end] !== 0) end += 1; return new TextDecoder("utf-8").decode(bytes.subarray(0, end)); }
function octal(bytes: Uint8Array): number { const value = string(bytes).trim(); return value === "" ? 0 : Number.parseInt(value.replace(/\0/g, ""), 8); }
function zeroBlock(bytes: Uint8Array): boolean { for (let index = 0; index < bytes.length; index += 1) if (bytes[index] !== 0) return false; return true; }

/** Browser-safe USTAR reader. It indexes entry slices; it never expands archive data into duplicate buffers. */
export class TarArchiveReader {
  public constructor(private readonly source: RandomAccessSource) {}
  public static fromBlob(blob: Blob): TarArchiveReader { return new TarArchiveReader(new BlobSource(blob)); }
  public async entries(signal?: AbortSignal): Promise<readonly TarEntry[]> {
    const entries: TarEntry[] = []; let offset = 0; let globalPax = ""; let pendingLongName = "";
    while (offset + 512 <= this.source.size) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const header = new Uint8Array(await this.source.read(offset, 512, signal));
      if (zeroBlock(header)) break;
      const baseName = string(header.subarray(0, 100)); const prefix = string(header.subarray(345, 500)); const declaredSize = octal(header.subarray(124, 136));
      const typeFlag = String.fromCharCode(header[156] ?? 0); const payloadOffset = offset + 512; const paddedSize = Math.ceil(declaredSize / 512) * 512;
      if (!Number.isSafeInteger(declaredSize) || payloadOffset + declaredSize > this.source.size) throw new SweepFormatError("TAR entry extends beyond archive bounds.", { severity: "error", code: "TAR_TRUNCATION", message: `Entry ${baseName} exceeds ${this.source.name}.`, fileName: this.source.name, byteOffset: offset, recoverable: false });
      if (typeFlag === "L") pendingLongName = string(new Uint8Array(await this.source.read(payloadOffset, declaredSize, signal))).trim();
      else if (typeFlag === "x" || typeFlag === "g") {
        const text = string(new Uint8Array(await this.source.read(payloadOffset, declaredSize, signal))); if (typeFlag === "g") globalPax = text; else pendingLongName = this.paxPath(text) ?? pendingLongName;
      } else {
        const name = pendingLongName || this.paxPath(globalPax) || (prefix ? `${prefix}/${baseName}` : baseName); pendingLongName = "";
        entries.push({ name, type: typeFlag === "0" || typeFlag === "\0" ? "file" : typeFlag === "5" ? "directory" : "unsupported", byteOffset: payloadOffset, size: declaredSize });
      }
      offset = payloadOffset + paddedSize;
    }
    return entries;
  }
  public async readEntry(entry: TarEntry, signal?: AbortSignal): Promise<ArrayBuffer> { return this.source.read(entry.byteOffset, entry.size, signal); }
  private paxPath(text: string): string | undefined { for (const line of text.split("\n")) { const match = /^\d+\s+path=(.*)$/.exec(line); if (match?.[1]) return match[1]; } return undefined; }
}
