import type { GeometryBounds } from "../../geometry/types";
import type { MapViewport, ScreenPoint, ScreenRect, WorldPoint } from "./types";

export function fitViewport(bounds: GeometryBounds, width: number, height: number, padding = 32): MapViewport {
  if (!(width > 0) || !(height > 0) || padding < 0) throw new RangeError("Map viewport dimensions must be positive and padding non-negative.");
  const spanX = Math.max(Number.EPSILON, bounds.maximumX - bounds.minimumX); const spanY = Math.max(Number.EPSILON, bounds.maximumY - bounds.minimumY); const usableWidth = Math.max(1, width - padding * 2); const usableHeight = Math.max(1, height - padding * 2);
  return { centerX: (bounds.minimumX + bounds.maximumX) / 2, centerY: (bounds.minimumY + bounds.maximumY) / 2, pixelsPerWorldUnit: Math.min(usableWidth / spanX, usableHeight / spanY) };
}
export function worldToScreen(point: WorldPoint, viewport: MapViewport, width: number, height: number): ScreenPoint { return { x: width / 2 + (point.x - viewport.centerX) * viewport.pixelsPerWorldUnit, y: height / 2 - (point.y - viewport.centerY) * viewport.pixelsPerWorldUnit }; }
export function screenToWorld(point: ScreenPoint, viewport: MapViewport, width: number, height: number): WorldPoint { return { x: viewport.centerX + (point.x - width / 2) / viewport.pixelsPerWorldUnit, y: viewport.centerY - (point.y - height / 2) / viewport.pixelsPerWorldUnit }; }
export function panViewport(viewport: MapViewport, deltaPixelsX: number, deltaPixelsY: number): MapViewport { return { ...viewport, centerX: viewport.centerX - deltaPixelsX / viewport.pixelsPerWorldUnit, centerY: viewport.centerY + deltaPixelsY / viewport.pixelsPerWorldUnit }; }
export function zoomViewportAt(viewport: MapViewport, cursor: ScreenPoint, factor: number, width: number, height: number): MapViewport {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError("Map zoom factor must be finite and positive.");
  const world = screenToWorld(cursor, viewport, width, height); const next = { ...viewport, pixelsPerWorldUnit: viewport.pixelsPerWorldUnit * factor }; const after = screenToWorld(cursor, next, width, height);
  return { ...next, centerX: next.centerX + world.x - after.x, centerY: next.centerY + world.y - after.y };
}

/** Fits a screen-space box without assuming geographic units. Degenerate boxes are rejected instead of producing an infinite zoom. */
export function viewportForScreenRect(rectangle: ScreenRect, viewport: MapViewport, width: number, height: number): MapViewport {
  const left = Math.min(rectangle.start.x, rectangle.end.x); const right = Math.max(rectangle.start.x, rectangle.end.x); const top = Math.min(rectangle.start.y, rectangle.end.y); const bottom = Math.max(rectangle.start.y, rectangle.end.y);
  if (right - left < 2 || bottom - top < 2) return viewport;
  const first = screenToWorld({ x: left, y: bottom }, viewport, width, height); const second = screenToWorld({ x: right, y: top }, viewport, width, height);
  const spanX = Math.max(Number.EPSILON, second.x - first.x); const spanY = Math.max(Number.EPSILON, second.y - first.y);
  return { centerX: (first.x + second.x) / 2, centerY: (first.y + second.y) / 2, pixelsPerWorldUnit: Math.min(width / spanX, height / spanY) };
}

export function screenRectToWorld(rectangle: ScreenRect, viewport: MapViewport, width: number, height: number): { readonly minimumX: number; readonly maximumX: number; readonly minimumY: number; readonly maximumY: number } {
  const first = screenToWorld(rectangle.start, viewport, width, height); const second = screenToWorld(rectangle.end, viewport, width, height);
  return { minimumX: Math.min(first.x, second.x), maximumX: Math.max(first.x, second.x), minimumY: Math.min(first.y, second.y), maximumY: Math.max(first.y, second.y) };
}
