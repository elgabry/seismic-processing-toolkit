import { SegyReader } from "../segy/segy-reader";
import { SweepDetector } from "../../sweep/sweep-detector";
import { SweepExtractor } from "../../sweep/sweep-extractor";
import type { SweepSignal } from "../../sweep/sweep-signal";
import type { SweepFileReader } from "./sweep-file-reader";

/** Imports ranked pilot candidates from a SEG-Y file without exposing parser internals. */
export class SegySweepReader implements SweepFileReader {
  public readonly id = "segy";
  public canRead(file: File): boolean { return /\.s(?:e)?gy$/i.test(file.name); }
  public async read(file: File, signal?: AbortSignal): Promise<readonly SweepSignal[]> {
    const dataset = await SegyReader.open(file, { signal });
    try {
      const candidates = SweepDetector.fromDataset(dataset);
      const ids = candidates.length > 0 ? candidates.map((candidate) => candidate.traceId) : [0];
      const signals: SweepSignal[] = [];
      for (const traceId of ids.slice(0, 16)) signals.push(await SweepExtractor.fromAuxiliaryTrace(dataset, traceId, signal));
      return signals.map((item, index) => ({ ...item, source: "external-file", metadata: { ...item.metadata, reader: this.id, rank: index + 1 } }));
    } finally { dataset.close(); }
  }
}
