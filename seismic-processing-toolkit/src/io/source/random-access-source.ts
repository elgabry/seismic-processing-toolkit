/** Browser-safe random access; all offsets and lengths are byte counts. */
export interface RandomAccessSource {
  readonly name: string;
  readonly size: number;
  read(offset: number, length: number, signal?: AbortSignal): Promise<ArrayBuffer>;
}
