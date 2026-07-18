import type { SweepSignal } from "../../sweep/sweep-signal";
import { CsvSweepReader } from "./csv-sweep-reader";
import { SegySweepReader } from "./segy-sweep-reader";
import type { SweepFileReader } from "./sweep-file-reader";
import { TarArchiveReader } from "./tar-archive-reader";
import { WavSweepReader } from "./wav-sweep-reader";

/** Inspects supported TAR entries one at a time; proprietary entries are left visible to callers as unsupported. */
export class TarSweepReader implements SweepFileReader {
  public readonly id = "tar";
  private readonly nested: readonly SweepFileReader[] = [new SegySweepReader(), new WavSweepReader(), new CsvSweepReader()];
  public canRead(file: File): boolean { return /\.tar$/i.test(file.name) || file.type === "application/x-tar"; }
  /** Lets UI show entries whose proprietary waveform decoder is not yet installed. */
  public async inspect(file: File, signal?: AbortSignal) { return TarArchiveReader.fromBlob(file).entries(signal); }
  public async read(file: File, signal?: AbortSignal): Promise<readonly SweepSignal[]> {
    const archive = TarArchiveReader.fromBlob(file); const output: SweepSignal[] = [];
    for (const entry of await archive.entries(signal)) {
      if (entry.type !== "file") continue;
      const reader = this.nested.find((candidate) => candidate.canRead(new File([], entry.name)));
      if (!reader) continue;
      const entryFile = new File([await archive.readEntry(entry, signal)], entry.name);
      for (const signalValue of await reader.read(entryFile, signal)) output.push({ ...signalValue, name: `${file.name}:${entry.name}`, source: "tar-entry", metadata: { ...signalValue.metadata, tarArchive: file.name, tarEntry: entry.name } });
    }
    return output;
  }
}
