import { SweepFormatError } from "../../core/errors/errors";
import type { SweepSignal } from "../../sweep/sweep-signal";
import type { SweepFileReader } from "./sweep-file-reader";

/** Reads one-column amplitudes or two-column time/amplitude delimited text. */
export class CsvSweepReader implements SweepFileReader {
  public readonly id = "csv-text";
  public canRead(file: File): boolean { return /\.(csv|txt|dat)$/i.test(file.name) || file.type.startsWith("text/"); }
  public async read(file: File, signal?: AbortSignal): Promise<readonly SweepSignal[]> {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const lines = (await file.text()).split(/\r?\n/); const amplitudes: number[] = []; const times: number[] = [];
    for (const line of lines) {
      const values = line.trim().split(/[\s,;\t]+/).map(Number).filter(Number.isFinite);
      if (values.length === 1) amplitudes.push(values[0] ?? 0);
      else if (values.length >= 2) { times.push(values[0] ?? 0); amplitudes.push(values[1] ?? 0); }
    }
    if (amplitudes.length < 2) throw new SweepFormatError("Text sweep file contains fewer than two numeric amplitudes.", { severity: "error", code: "TEXT_SWEEP_EMPTY", message: `No usable waveform found in ${file.name}.`, fileName: file.name, recoverable: false });
    let dt = 0.001;
    if (times.length >= 2) { dt = (times[times.length - 1]! - times[0]!) / (times.length - 1); if (!(dt > 0)) throw new SweepFormatError("Sweep time values are not increasing.", { severity: "error", code: "INVALID_SWEEP_TIME", message: `Unable to infer sample interval from ${file.name}.`, fileName: file.name, recoverable: false }); }
    return [{ id: crypto.randomUUID(), name: file.name, samples: Float32Array.from(amplitudes), sampleIntervalSeconds: dt, startTimeSeconds: times[0] ?? 0, units: "counts", source: "external-file", metadata: { reader: this.id, columns: times.length > 0 ? 2 : 1 } }];
  }
}
