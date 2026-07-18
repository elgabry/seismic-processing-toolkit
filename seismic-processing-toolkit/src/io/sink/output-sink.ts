/** Streaming destination for exports; callers must close or abort explicitly. */
export interface OutputSink { write(chunk: Uint8Array): Promise<void>; close(): Promise<void>; abort(reason?: unknown): Promise<void>; }
export interface FileSystemWritableFileHandleLike { createWritable(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void>; abort(reason?: unknown): Promise<void> }>; }

/** Browser-memory fallback for small exports only. */
export class BlobOutputSink implements OutputSink {
  private readonly chunks: Uint8Array[] = [];
  private closed = false;
  private bytesWritten = 0;
  public constructor(private readonly contentType = "application/octet-stream", private readonly maxBytes = 512 * 1024 * 1024) {}
  public async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("Output sink is already closed.");
    const nextBytes = this.bytesWritten + chunk.byteLength;
    if (nextBytes > this.maxBytes) throw new RangeError("Blob export exceeds the configured in-memory limit; use a streaming sink.");
    this.chunks.push(chunk.slice()); this.bytesWritten = nextBytes;
  }
  public async close(): Promise<void> { this.closed = true; }
  public async abort(): Promise<void> { this.closed = true; this.chunks.length = 0; this.bytesWritten = 0; }
  public toBlob(): Blob { if (!this.closed) throw new Error("Close the sink before reading its Blob."); return new Blob(this.chunks, { type: this.contentType }); }
}

/** Adapter for FileSystemWritableFileStream or a standard WritableStream writer. */
export class WritableStreamOutputSink implements OutputSink {
  public constructor(private readonly writable: WritableStreamDefaultWriter<Uint8Array>) {}
  public async write(chunk: Uint8Array): Promise<void> { await this.writable.write(chunk); }
  public async close(): Promise<void> { await this.writable.close(); }
  public async abort(reason?: unknown): Promise<void> { await this.writable.abort(reason); }
}

/** File System Access API sink when a browser exposes a user-approved file handle. */
export class FileSystemAccessOutputSink implements OutputSink {
  private constructor(private readonly writable: { write(data: BufferSource): Promise<void>; close(): Promise<void>; abort(reason?: unknown): Promise<void> }) {}
  public static async create(handle: FileSystemWritableFileHandleLike): Promise<FileSystemAccessOutputSink> { return new FileSystemAccessOutputSink(await handle.createWritable()); }
  public async write(chunk: Uint8Array): Promise<void> { await this.writable.write(chunk); }
  public async close(): Promise<void> { await this.writable.close(); }
  public async abort(reason?: unknown): Promise<void> { await this.writable.abort(reason); }
}
