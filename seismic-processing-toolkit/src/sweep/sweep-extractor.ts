import type { SegyDataset } from "../io/segy/segy-dataset";
import type { SweepSignal } from "./sweep-signal";

/** Extracts an explicitly selected auxiliary/pilot trace with no mutation of the dataset cache. */
export class SweepExtractor {
  public static async fromAuxiliaryTrace(dataset: SegyDataset, traceId: number, signal?: AbortSignal): Promise<SweepSignal> {
    const samples = (await dataset.traces.readTrace(traceId, signal)).slice();
    const dt = (dataset.traceIndex.sampleIntervalsMicroseconds[traceId] ?? 0) / 1_000_000;
    if (!(dt > 0)) throw new RangeError("Selected sweep trace has no valid sample interval.");
    return { id: crypto.randomUUID(), name: `${dataset.name}: trace ${traceId + 1}`, samples, sampleIntervalSeconds: dt, startTimeSeconds: 0, units: "counts", source: "auxiliary-trace", metadata: { dataset: dataset.name, traceId } };
  }
}
