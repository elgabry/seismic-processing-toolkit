import type { GeometryTable } from "../../geometry/geometry-table";
import type { GeometryRole } from "../../geometry/types";
import { worldToScreen } from "./map-transforms";
import type { MapRenderOptions, MapViewport } from "./types";

const colors: Readonly<Record<GeometryRole, string>> = { source: "#f4b942", receiver: "#5cc8ff", cmp: "#b79cff" };

/** Canvas-only offline geometry renderer; consumers own interaction and selection state. */
export class GeometryMapRenderer {
  public render(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, table: GeometryTable, viewport: MapViewport, options: MapRenderOptions): void {
    const radius = options.pointRadius ?? 2; context.save(); context.fillStyle = options.background ?? "#081117"; context.fillRect(0, 0, options.width, options.height);
    this.drawRole(context, table, "receiver", viewport, options, radius, options.receiversVisible ?? true); this.drawRole(context, table, "source", viewport, options, radius + 0.5, options.sourcesVisible ?? true);
    context.fillStyle = "#b7c9d3"; context.font = "11px ui-monospace, monospace"; context.fillText("Local coordinates — no basemap or reprojection", 8, 16); context.restore();
  }

  private drawRole(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, table: GeometryTable, role: GeometryRole, viewport: MapViewport, options: MapRenderOptions, radius: number, visible: boolean): void {
    if (!visible) return;
    for (let traceId = 0; traceId < table.traceCount; traceId += 1) {
      const point = table.point(traceId, role); if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const screen = worldToScreen(point, viewport, options.width, options.height); if (screen.x < -radius || screen.y < -radius || screen.x > options.width + radius || screen.y > options.height + radius) continue;
      const selected = options.selectedTraceIds?.has(traceId) ?? false; const finding = options.findingTraceIds?.has(traceId) ?? false;
      context.beginPath(); context.arc(screen.x, screen.y, selected || finding ? radius + 2 : radius, 0, Math.PI * 2); context.fillStyle = finding ? "#ff637d" : selected ? "#50e3a4" : colors[role]; context.fill();
    }
  }
}
