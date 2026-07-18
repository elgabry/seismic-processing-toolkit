export type CoordinateUnits = "unknown" | "length" | "arc-seconds" | "decimal-degrees" | "dms";
export type GeometryRole = "source" | "receiver" | "cmp";
export type GeometrySeverity = "info" | "warning" | "error";

export interface GeometryPoint {
  readonly traceId: number;
  readonly role: GeometryRole;
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly rawX: number;
  readonly rawY: number;
  readonly coordinateScalar: number;
  readonly coordinateUnits: CoordinateUnits;
  readonly sourceId?: number;
  readonly receiverId?: number;
  readonly cmpId?: number;
}

export interface GeometryBounds { readonly minimumX: number; readonly maximumX: number; readonly minimumY: number; readonly maximumY: number; }

export interface GeometryFinding {
  readonly severity: GeometrySeverity;
  readonly code: string;
  readonly message: string;
  readonly traceIds: Uint32Array;
  readonly suggestedAction: string;
  readonly observed?: Readonly<Record<string, number | string>>;
  readonly threshold?: number;
}

export interface GeometrySummary {
  readonly sourceCount: number;
  readonly receiverCount: number;
  readonly cmpCount: number;
  readonly bounds?: GeometryBounds;
  readonly medianSourceSpacing?: number;
  readonly medianReceiverSpacing?: number;
  readonly offsetMinimum?: number;
  readonly offsetMaximum?: number;
  readonly elevationMinimum?: number;
  readonly elevationMaximum?: number;
  readonly missingCoordinateFraction: number;
  readonly duplicateFraction: number;
  readonly coordinateUnits: Readonly<Record<CoordinateUnits, number>>;
  readonly coordinateScalars: Readonly<Record<string, number>>;
}

export interface GeometryQcResult { readonly findings: readonly GeometryFinding[]; readonly summary: GeometrySummary; }

export interface GeometryQcOptions {
  readonly offsetDiscrepancyFraction?: number;
  readonly minimumOffsetDiscrepancy?: number;
  readonly jumpMultiplier?: number;
  readonly outlierOffsetMultiplier?: number;
  readonly nearCoincidenceDistance?: number;
}
