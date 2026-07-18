import type { GeometryTable } from "../../geometry/geometry-table";
import type { GeometryRole } from "../../geometry/types";
import { worldToScreen } from "./map-transforms";
import type { MapHit, MapViewport } from "./types";

interface IndexedPoint { readonly traceId: number; readonly role: GeometryRole; readonly x: number; readonly y: number; }

/** Fixed grid keeps hit-testing candidate counts bounded instead of scanning every map point on pointer movement. */
export class MapSpatialIndex {
  private readonly cells = new Map<string, IndexedPoint[]>();
  private readonly cellSize: number;
  public constructor(table: GeometryTable, roles: readonly GeometryRole[] = ["source", "receiver"]) {
    const bounds = table.bounds(roles); this.cellSize = bounds === undefined ? 1 : Math.max(Number.EPSILON, Math.max(bounds.maximumX - bounds.minimumX, bounds.maximumY - bounds.minimumY) / 64);
    for (let traceId = 0; traceId < table.traceCount; traceId += 1) for (const role of roles) { const point = table.point(traceId, role); if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue; const key = this.key(point.x, point.y); const values = this.cells.get(key) ?? []; values.push({ traceId, role, x: point.x, y: point.y }); this.cells.set(key, values); }
  }
  public hitTest(worldX: number, worldY: number, viewport: MapViewport, width: number, height: number, maximumPixels = 8): MapHit | undefined {
    const cellX = Math.floor(worldX / this.cellSize); const cellY = Math.floor(worldY / this.cellSize); let best: MapHit | undefined;
    for (let y = cellY - 1; y <= cellY + 1; y += 1) for (let x = cellX - 1; x <= cellX + 1; x += 1) for (const point of this.cells.get(`${x}:${y}`) ?? []) {
      const screen = worldToScreen(point, viewport, width, height); const cursor = worldToScreen({ x: worldX, y: worldY }, viewport, width, height); const distancePixels = Math.hypot(screen.x - cursor.x, screen.y - cursor.y);
      if (distancePixels <= maximumPixels && (best === undefined || distancePixels < best.distancePixels)) best = { traceId: point.traceId, role: point.role, distancePixels };
    }
    return best;
  }
  /** Returns only grid candidates intersecting the world box; callers never need a whole-table pointer scan. */
  public tracesInBox(bounds: { readonly minimumX: number; readonly maximumX: number; readonly minimumY: number; readonly maximumY: number }): Uint32Array {
    const ids = new Set<number>();
    const minCellX = Math.floor(bounds.minimumX / this.cellSize); const maxCellX = Math.floor(bounds.maximumX / this.cellSize); const minCellY = Math.floor(bounds.minimumY / this.cellSize); const maxCellY = Math.floor(bounds.maximumY / this.cellSize);
    for (let y = minCellY; y <= maxCellY; y += 1) for (let x = minCellX; x <= maxCellX; x += 1) for (const point of this.cells.get(`${x}:${y}`) ?? []) if (point.x >= bounds.minimumX && point.x <= bounds.maximumX && point.y >= bounds.minimumY && point.y <= bounds.maximumY) ids.add(point.traceId);
    return Uint32Array.from(ids).sort();
  }
  private key(x: number, y: number): string { return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`; }
}
