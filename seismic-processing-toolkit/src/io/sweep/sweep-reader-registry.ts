import type { SweepSignal } from "../../sweep/sweep-signal";
import { CsvSweepReader } from "./csv-sweep-reader";
import { SegySweepReader } from "./segy-sweep-reader";
import type { SweepFileReader } from "./sweep-file-reader";
import { TarSweepReader } from "./tar-sweep-reader";
import { WavSweepReader } from "./wav-sweep-reader";

export class SweepReaderRegistry {
  private readonly readers: readonly SweepFileReader[];
  public constructor(readers: readonly SweepFileReader[] = [new TarSweepReader(), new SegySweepReader(), new WavSweepReader(), new CsvSweepReader()]) { this.readers = readers; }
  public async read(file: File, signal?: AbortSignal): Promise<readonly SweepSignal[]> {
    const reader = this.readers.find((candidate) => candidate.canRead(file));
    if (!reader) throw new Error(`No sweep reader accepts ${file.name}.`);
    return reader.read(file, signal);
  }
}
