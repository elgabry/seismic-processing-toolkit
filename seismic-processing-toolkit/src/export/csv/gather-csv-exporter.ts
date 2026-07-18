import type { OutputSink } from "../../io/sink/output-sink";
import type { Gather } from "../../processing/gathers/gather-index";
import { CsvExportService, type CsvExportOptions } from "./csv-export-service";

export class GatherCsvExporter {
  public static async export(gather: Gather, sink: OutputSink, options: CsvExportOptions = {}): Promise<number> {
    async function* rows(): AsyncGenerator<readonly (number | string)[]> { await Promise.resolve(); for (let order = 0; order < gather.traceIds.length; order += 1) yield [gather.key, order, gather.traceIds[order] ?? 0, gather.diagnostics.join("; ")]; }
    return CsvExportService.write(sink, ["gatherKey", "traceOrder", "traceId", "gatherDiagnostics"], rows(), options);
  }
}
