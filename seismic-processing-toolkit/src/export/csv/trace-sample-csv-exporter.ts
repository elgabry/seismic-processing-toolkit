import { ExportSizeLimitError } from "../../core/errors/errors";
import type { OutputSink } from "../../io/sink/output-sink";
import type { SegyDataset } from "../../io/segy/segy-dataset";
import { CsvExportService, type CsvExportOptions } from "./csv-export-service";

export interface TraceSampleCsvOptions extends CsvExportOptions { readonly traceIds: Uint32Array; readonly format?: "long" | "wide"; readonly maximumWideColumns?: number; readonly maximumWideCells?: number; }

export class TraceSampleCsvExporter {
  public static async export(dataset: SegyDataset, sink: OutputSink, options: TraceSampleCsvOptions): Promise<number> {
    const format = options.format ?? "long";
    if (format === "long") return this.exportLong(dataset, sink, options);
    return this.exportWide(dataset, sink, options);
  }
  private static async exportLong(dataset: SegyDataset, sink: OutputSink, options: TraceSampleCsvOptions): Promise<number> {
    async function* rows(): AsyncGenerator<readonly number[]> {
      for (const traceId of options.traceIds) { const samples = await dataset.traces.readTrace(traceId, options.signal); const interval = (dataset.traceIndex.sampleIntervalsMicroseconds[traceId] ?? 0) / 1_000_000; for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) yield [traceId, sampleIndex, sampleIndex * interval, samples[sampleIndex] ?? 0]; }
    }
    return CsvExportService.write(sink, ["traceId", "sampleIndex", "timeSeconds", "amplitude"], rows(), options);
  }
  private static async exportWide(dataset: SegyDataset, sink: OutputSink, options: TraceSampleCsvOptions): Promise<number> {
    const maximumColumns = options.maximumWideColumns ?? 128; if (options.traceIds.length > maximumColumns) throw new ExportSizeLimitError("Wide CSV selection has too many trace columns.", { severity: "error", code: "CSV_WIDE_COLUMNS", message: `Wide CSV allows at most ${maximumColumns} traces.`, recoverable: false });
    const traces: Float32Array[] = []; let maximumSamples = 0;
    for (const traceId of options.traceIds) { const trace = await dataset.traces.readTrace(traceId, options.signal); traces.push(trace); maximumSamples = Math.max(maximumSamples, trace.length); }
    const cells = maximumSamples * options.traceIds.length; const maximumCells = options.maximumWideCells ?? 1_000_000; if (cells > maximumCells) throw new ExportSizeLimitError("Wide CSV would exceed the safe cell limit.", { severity: "error", code: "CSV_WIDE_CELLS", message: `Wide CSV would emit ${cells} cells; limit is ${maximumCells}.`, recoverable: false });
    const interval = options.traceIds.length === 0 ? 0 : (dataset.traceIndex.sampleIntervalsMicroseconds[options.traceIds[0] ?? 0] ?? 0) / 1_000_000;
    async function* rows(): AsyncGenerator<readonly (number | undefined)[]> { await Promise.resolve(); for (let sampleIndex = 0; sampleIndex < maximumSamples; sampleIndex += 1) yield [sampleIndex * interval, ...traces.map((trace) => trace[sampleIndex])]; }
    return CsvExportService.write(sink, ["timeSeconds", ...Array.from(options.traceIds, (traceId) => `trace_${traceId}`)], rows(), options);
  }
}
