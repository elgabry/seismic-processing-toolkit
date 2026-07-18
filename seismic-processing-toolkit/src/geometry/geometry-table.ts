import type { CoordinateUnits, GeometryBounds, GeometryPoint, GeometryRole } from "./types";

/** Columnar per-trace geometry retaining raw header values alongside scaled analysis coordinates. */
export class GeometryTable {
  public readonly traceCount: number;
  public constructor(
    public readonly traceIds: Uint32Array,
    public readonly sourceIds: Int32Array,
    public readonly receiverIds: Int32Array,
    public readonly cmpIds: Int32Array,
    public readonly rawSourceX: Int32Array,
    public readonly rawSourceY: Int32Array,
    public readonly rawReceiverX: Int32Array,
    public readonly rawReceiverY: Int32Array,
    public readonly sourceX: Float64Array,
    public readonly sourceY: Float64Array,
    public readonly receiverX: Float64Array,
    public readonly receiverY: Float64Array,
    public readonly sourceElevation: Float64Array,
    public readonly receiverElevation: Float64Array,
    public readonly coordinateScalars: Int16Array,
    public readonly elevationScalars: Int16Array,
    public readonly coordinateUnitCodes: Int16Array,
    public readonly headerOffsets: Int32Array
  ) {
    this.traceCount = traceIds.length;
    const columns = [sourceIds, receiverIds, cmpIds, rawSourceX, rawSourceY, rawReceiverX, rawReceiverY, sourceX, sourceY, receiverX, receiverY, sourceElevation, receiverElevation, coordinateScalars, elevationScalars, coordinateUnitCodes, headerOffsets];
    if (columns.some((column) => column.length !== this.traceCount)) throw new RangeError("Geometry columns must have the same trace count.");
  }

  public coordinateUnits(traceId: number): CoordinateUnits {
    const code = this.coordinateUnitCodes[traceId] ?? 0;
    return code === 1 ? "length" : code === 2 ? "arc-seconds" : code === 3 ? "decimal-degrees" : code === 4 ? "dms" : "unknown";
  }

  public point(traceId: number, role: GeometryRole): GeometryPoint {
    if (!Number.isInteger(traceId) || traceId < 0 || traceId >= this.traceCount) throw new RangeError(`Geometry trace ${traceId} is outside the table.`);
    const sourceX = this.sourceX[traceId] ?? Number.NaN; const sourceY = this.sourceY[traceId] ?? Number.NaN; const receiverX = this.receiverX[traceId] ?? Number.NaN; const receiverY = this.receiverY[traceId] ?? Number.NaN;
    if (role === "source") return { traceId, role, x: sourceX, y: sourceY, z: this.sourceElevation[traceId] ?? 0, rawX: this.rawSourceX[traceId] ?? 0, rawY: this.rawSourceY[traceId] ?? 0, coordinateScalar: this.coordinateScalars[traceId] ?? 0, coordinateUnits: this.coordinateUnits(traceId), sourceId: this.sourceIds[traceId] ?? 0 };
    if (role === "receiver") return { traceId, role, x: receiverX, y: receiverY, z: this.receiverElevation[traceId] ?? 0, rawX: this.rawReceiverX[traceId] ?? 0, rawY: this.rawReceiverY[traceId] ?? 0, coordinateScalar: this.coordinateScalars[traceId] ?? 0, coordinateUnits: this.coordinateUnits(traceId), receiverId: this.receiverIds[traceId] ?? 0 };
    return { traceId, role, x: (sourceX + receiverX) / 2, y: (sourceY + receiverY) / 2, rawX: Math.round(((this.rawSourceX[traceId] ?? 0) + (this.rawReceiverX[traceId] ?? 0)) / 2), rawY: Math.round(((this.rawSourceY[traceId] ?? 0) + (this.rawReceiverY[traceId] ?? 0)) / 2), coordinateScalar: this.coordinateScalars[traceId] ?? 0, coordinateUnits: this.coordinateUnits(traceId), cmpId: this.cmpIds[traceId] ?? 0 };
  }

  public bounds(roles: readonly GeometryRole[] = ["source", "receiver"]): GeometryBounds | undefined {
    let minimumX = Infinity; let maximumX = -Infinity; let minimumY = Infinity; let maximumY = -Infinity;
    for (let traceId = 0; traceId < this.traceCount; traceId += 1) for (const role of roles) {
      const point = this.point(traceId, role);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      minimumX = Math.min(minimumX, point.x); maximumX = Math.max(maximumX, point.x); minimumY = Math.min(minimumY, point.y); maximumY = Math.max(maximumY, point.y);
    }
    return minimumX === Infinity ? undefined : { minimumX, maximumX, minimumY, maximumY };
  }
}
