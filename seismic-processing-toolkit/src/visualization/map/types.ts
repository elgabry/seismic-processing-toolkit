import type { GeometryRole } from "../../geometry/types";

export interface MapViewport { readonly centerX: number; readonly centerY: number; readonly pixelsPerWorldUnit: number; }
export interface ScreenPoint { readonly x: number; readonly y: number; }
export interface WorldPoint { readonly x: number; readonly y: number; }
export interface MapRenderOptions {
  readonly width: number;
  readonly height: number;
  readonly pointRadius?: number;
  readonly sourcesVisible?: boolean;
  readonly receiversVisible?: boolean;
  readonly cmpsVisible?: boolean;
  readonly selectedTraceIds?: ReadonlySet<number>;
  readonly findingTraceIds?: ReadonlySet<number>;
  readonly findingSeverityTraceIds?: ReadonlySet<number>;
  readonly colorBy?: "role" | "offset" | "sourceId" | "receiverId" | "cmpId" | "qc";
  readonly background?: string;
}
export interface MapHit { readonly traceId: number; readonly role: GeometryRole; readonly distancePixels: number; }
export interface ScreenRect { readonly start: ScreenPoint; readonly end: ScreenPoint; }
