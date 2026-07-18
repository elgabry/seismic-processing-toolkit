import { HeaderScalars } from "../io/segy/headers/header-scalars";
import type { SegyDataset } from "../io/segy/segy-dataset";
import { GeometryTable } from "./geometry-table";

/** Reads standard headers through their public API and builds compact raw/scaled geometry columns. */
export class GeometryBuilder {
  public static async fromSegy(dataset: SegyDataset, signal?: AbortSignal): Promise<GeometryTable> {
    const count = dataset.traceCount; const traceIds = new Uint32Array(count); const sourceIds = new Int32Array(count); const receiverIds = new Int32Array(count); const cmpIds = new Int32Array(count);
    const rawSourceX = new Int32Array(count); const rawSourceY = new Int32Array(count); const rawReceiverX = new Int32Array(count); const rawReceiverY = new Int32Array(count);
    const sourceX = new Float64Array(count); const sourceY = new Float64Array(count); const receiverX = new Float64Array(count); const receiverY = new Float64Array(count); const sourceElevation = new Float64Array(count); const receiverElevation = new Float64Array(count);
    const coordinateScalars = new Int16Array(count); const elevationScalars = new Int16Array(count); const coordinateUnitCodes = new Int16Array(count); const headerOffsets = new Int32Array(count);
    for (let traceId = 0; traceId < count; traceId += 1) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const header = await dataset.traces.readHeader(traceId, signal); const coordinateScalar = header.raw("coordinateScalar"); const elevationScalar = header.raw("elevationScalar");
      traceIds[traceId] = traceId; sourceIds[traceId] = header.raw("fieldRecordNumber"); receiverIds[traceId] = header.raw("traceNumberWithinFieldRecord"); cmpIds[traceId] = header.raw("cdp");
      rawSourceX[traceId] = header.raw("sourceX"); rawSourceY[traceId] = header.raw("sourceY"); rawReceiverX[traceId] = header.raw("receiverX"); rawReceiverY[traceId] = header.raw("receiverY");
      sourceX[traceId] = HeaderScalars.apply(rawSourceX[traceId] ?? 0, coordinateScalar); sourceY[traceId] = HeaderScalars.apply(rawSourceY[traceId] ?? 0, coordinateScalar); receiverX[traceId] = HeaderScalars.apply(rawReceiverX[traceId] ?? 0, coordinateScalar); receiverY[traceId] = HeaderScalars.apply(rawReceiverY[traceId] ?? 0, coordinateScalar);
      sourceElevation[traceId] = HeaderScalars.apply(header.raw("sourceElevation"), elevationScalar); receiverElevation[traceId] = HeaderScalars.apply(header.raw("receiverElevation"), elevationScalar);
      coordinateScalars[traceId] = coordinateScalar; elevationScalars[traceId] = elevationScalar; coordinateUnitCodes[traceId] = header.raw("coordinateUnits"); headerOffsets[traceId] = header.raw("offset");
    }
    return new GeometryTable(traceIds, sourceIds, receiverIds, cmpIds, rawSourceX, rawSourceY, rawReceiverX, rawReceiverY, sourceX, sourceY, receiverX, receiverY, sourceElevation, receiverElevation, coordinateScalars, elevationScalars, coordinateUnitCodes, headerOffsets);
  }
}
