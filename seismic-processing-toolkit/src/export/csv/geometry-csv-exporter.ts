import type { GeometryTable } from "../../geometry/geometry-table";
import type { OutputSink } from "../../io/sink/output-sink";
import { CsvExportService, type CsvExportOptions } from "./csv-export-service";

export interface GeometryCsvOptions extends CsvExportOptions { readonly roles?: readonly ("source" | "receiver" | "cmp")[]; readonly qcFlags?: ReadonlyMap<number, readonly string[]>; }

export class GeometryCsvExporter {
  public static async export(table: GeometryTable, sink: OutputSink, options: GeometryCsvOptions = {}): Promise<number> {
    const roles = options.roles ?? ["source", "receiver", "cmp"];
    async function* rows(): AsyncGenerator<readonly (string | number)[]> {
      await Promise.resolve();
      for (let traceId = 0; traceId < table.traceCount; traceId += 1) for (const role of roles) {
        const point = table.point(traceId, role); const calculatedOffset = Math.hypot((table.sourceX[traceId] ?? 0) - (table.receiverX[traceId] ?? 0), (table.sourceY[traceId] ?? 0) - (table.receiverY[traceId] ?? 0));
        yield [traceId, role, point.x, point.y, point.z ?? "", point.rawX, point.rawY, point.coordinateScalar, point.coordinateUnits, point.sourceId ?? "", point.receiverId ?? "", point.cmpId ?? "", table.headerOffsets[traceId] ?? "", calculatedOffset, options.qcFlags?.get(traceId)?.join(";") ?? ""];
      }
    }
    return CsvExportService.write(sink, ["traceId", "role", "x", "y", "z", "rawX", "rawY", "coordinateScalar", "coordinateUnits", "sourceId", "receiverId", "cmpId", "headerOffset", "calculatedOffset", "qcFlags"], rows(), options);
  }
}
