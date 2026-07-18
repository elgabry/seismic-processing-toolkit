import type { GeometryTable } from "../../geometry/geometry-table";
import type { GeometryRole } from "../../geometry/types";
import { worldToScreen } from "./map-transforms";
import type { MapRenderOptions, MapViewport } from "./types";

const colors: Readonly<Record<GeometryRole, string>> = { source: "#f4b942", receiver: "#5cc8ff", cmp: "#b79cff" };

function palette(value: number, minimum: number, maximum: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum === minimum) return "#aab8c2";
  const ratio = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum))); const red = Math.round(40 + ratio * 215); const blue = Math.round(220 - ratio * 170);
  return `rgb(${red},${Math.round(110 + ratio * 80)},${blue})`;
}

/** Canvas-only offline geometry renderer; consumers own interaction and selection state. */
export class GeometryMapRenderer {
  public render(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, table: GeometryTable, viewport: MapViewport, options: MapRenderOptions): void {
    const radius = options.pointRadius ?? 2; context.save(); context.fillStyle = options.background ?? "#081117"; context.fillRect(0, 0, options.width, options.height);
    const range = this.colorRange(table, options.colorBy ?? "role");
    this.drawRole(context, table, "receiver", viewport, options, radius, options.receiversVisible ?? true, range); this.drawRole(context, table, "source", viewport, options, radius + 0.5, options.sourcesVisible ?? true, range); this.drawRole(context, table, "cmp", viewport, options, radius, options.cmpsVisible ?? false, range);
    context.fillStyle = "#b7c9d3"; context.font = "11px ui-monospace, monospace"; context.fillText("Local coordinates — no basemap or reprojection", 8, 16); context.restore();
  }

  private drawRole(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, table: GeometryTable, role: GeometryRole, viewport: MapViewport, options: MapRenderOptions, radius: number, visible: boolean, range: readonly [number, number] | undefined): void {
    if (!visible) return;
    for (let traceId = 0; traceId < table.traceCount; traceId += 1) {
      const point = table.point(traceId, role); if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const screen = worldToScreen(point, viewport, options.width, options.height); if (screen.x < -radius || screen.y < -radius || screen.x > options.width + radius || screen.y > options.height + radius) continue;
      const selected = options.selectedTraceIds?.has(traceId) ?? false; const finding = options.findingTraceIds?.has(traceId) ?? false;
      context.beginPath(); context.arc(screen.x, screen.y, selected || finding ? radius + 2 : radius, 0, Math.PI * 2); context.fillStyle = finding ? "#ff637d" : selected ? "#50e3a4" : this.pointColor(table, traceId, role, options, range); context.fill();
    }
  }

  private pointColor(table: GeometryTable, traceId: number, role: GeometryRole, options: MapRenderOptions, range: readonly [number, number] | undefined): string {
    const colorBy = options.colorBy ?? "role";
    if (colorBy === "role" || colorBy === "qc") return colors[role];
    const values = colorBy === "offset" ? table.headerOffsets : colorBy === "sourceId" ? table.sourceIds : colorBy === "receiverId" ? table.receiverIds : table.cmpIds;
    return palette(values[traceId] ?? Number.NaN, range?.[0] ?? Number.NaN, range?.[1] ?? Number.NaN);
  }

  private colorRange(table: GeometryTable, colorBy: NonNullable<MapRenderOptions["colorBy"]>): readonly [number, number] | undefined {
    if (colorBy === "role" || colorBy === "qc") return undefined;
    const values = colorBy === "offset" ? table.headerOffsets : colorBy === "sourceId" ? table.sourceIds : colorBy === "receiverId" ? table.receiverIds : table.cmpIds;
    let minimum = Infinity; let maximum = -Infinity;
    for (let index = 0; index < values.length; index += 1) { const value = values[index] ?? Number.NaN; if (Number.isFinite(value)) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); } }
    return minimum === Infinity ? undefined : [minimum, maximum];
  }
}
