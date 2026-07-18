import type { OutputSink } from "../../io/sink/output-sink";
import type { SegyDataset } from "../../io/segy/segy-dataset";
import { TraceHeaderSchema } from "../../io/segy/headers/trace-header-schema";
import { CsvExportService, type CsvExportOptions } from "./csv-export-service";

export interface TraceHeaderCsvOptions extends CsvExportOptions { readonly traceIds?: Uint32Array; readonly fieldIds?: readonly string[]; readonly includeScaledCoordinates?: boolean; }

export class TraceHeaderCsvExporter {
  public static async export(dataset: SegyDataset, sink: OutputSink, options: TraceHeaderCsvOptions = {}): Promise<number> {
    const descriptors = TraceHeaderSchema.filter((field) => options.fieldIds === undefined || options.fieldIds.includes(field.id)); const traceIds = options.traceIds ?? Uint32Array.from({ length: dataset.traceCount }, (_, index) => index);
    const header = ["traceId", ...descriptors.map((field) => field.id), ...(options.includeScaledCoordinates ?? true ? ["sourceXScaled", "sourceYScaled", "receiverXScaled", "receiverYScaled"] : [])];
    async function* rows(): AsyncGenerator<readonly (string | number)[]> {
      for (const traceId of traceIds) {
        const traceHeader = await dataset.traces.readHeader(traceId, options.signal); const values: (string | number)[] = [traceId];
        for (const descriptor of descriptors) values.push(traceHeader.raw(descriptor.id));
        if (options.includeScaledCoordinates ?? true) values.push(traceHeader.scaled("sourceX"), traceHeader.scaled("sourceY"), traceHeader.scaled("receiverX"), traceHeader.scaled("receiverY"));
        yield values;
      }
    }
    return CsvExportService.write(sink, header, rows(), options);
  }
}
