import { GeometryValidationError } from "../core/errors/errors";
import type { GeometryTable } from "./geometry-table";
import type { CoordinateUnits, GeometryFinding, GeometryQcOptions, GeometryQcResult, GeometrySummary } from "./types";

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle];
}
function ids(values: readonly number[]): Uint32Array { return new Uint32Array(values); }
function finding(severity: GeometryFinding["severity"], code: string, message: string, traceIds: readonly number[], suggestedAction: string, observed?: Readonly<Record<string, number | string>>, threshold?: number): GeometryFinding {
  return { severity, code, message, traceIds: ids(traceIds), suggestedAction, ...(observed === undefined ? {} : { observed }), ...(threshold === undefined ? {} : { threshold }) };
}
function unitCounts(): Record<CoordinateUnits, number> { return { unknown: 0, length: 0, "arc-seconds": 0, "decimal-degrees": 0, dms: 0 }; }
function distance(x0: number, y0: number, x1: number, y1: number): number { return Math.hypot(x1 - x0, y1 - y0); }
function coordinateKey(x: number, y: number): string { return `${x.toPrecision(15)},${y.toPrecision(15)}`; }

/** Produces structured, unit-aware geometry findings without projecting or relabelling input coordinates. */
export class GeometryQcAnalyzer {
  public static analyze(table: GeometryTable, options: GeometryQcOptions = {}): GeometryQcResult {
    if (table.traceCount === 0) throw new GeometryValidationError("Geometry QC requires at least one trace.", { severity: "error", code: "GEOMETRY_EMPTY", message: "No traces are available for geometry QC.", recoverable: false });
    const findings: GeometryFinding[] = []; const missing: number[] = []; const zero: number[] = []; const coincident: number[] = []; const missingElevation: number[] = []; const badScalar: number[] = [];
    const unitDistribution = unitCounts(); const scalarDistribution: Record<string, number> = {}; const validSourceSpacings: number[] = []; const validReceiverSpacings: number[] = []; const offsets: number[] = []; const elevations: number[] = [];
    const sourcePositions = new Map<string, number[]>(); const receiverPositions = new Map<string, number[]>(); const sourceIds = new Map<number, string>(); const receiverIds = new Map<number, string>(); const conflictingSourceIds: number[] = []; const conflictingReceiverIds: number[] = [];
    let previousSource: readonly [number, number] | undefined; let previousReceiver: readonly [number, number] | undefined;
    for (let traceId = 0; traceId < table.traceCount; traceId += 1) {
      const sx = table.sourceX[traceId] ?? Number.NaN; const sy = table.sourceY[traceId] ?? Number.NaN; const rx = table.receiverX[traceId] ?? Number.NaN; const ry = table.receiverY[traceId] ?? Number.NaN;
      const scalar = table.coordinateScalars[traceId] ?? 0; const units = table.coordinateUnits(traceId); unitDistribution[units] += 1; scalarDistribution[String(scalar)] = (scalarDistribution[String(scalar)] ?? 0) + 1;
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(rx) || !Number.isFinite(ry)) missing.push(traceId);
      else {
        if (sx === 0 && sy === 0 || rx === 0 && ry === 0) zero.push(traceId);
        const sourceKey = coordinateKey(sx, sy); const receiverKey = coordinateKey(rx, ry); const sourceList = sourcePositions.get(sourceKey) ?? []; sourceList.push(traceId); sourcePositions.set(sourceKey, sourceList); const receiverList = receiverPositions.get(receiverKey) ?? []; receiverList.push(traceId); receiverPositions.set(receiverKey, receiverList);
        const sourceId = table.sourceIds[traceId] ?? 0; const receiverId = table.receiverIds[traceId] ?? 0; const priorSource = sourceIds.get(sourceId); const priorReceiver = receiverIds.get(receiverId); if (priorSource !== undefined && priorSource !== sourceKey) conflictingSourceIds.push(traceId); if (priorReceiver !== undefined && priorReceiver !== receiverKey) conflictingReceiverIds.push(traceId); sourceIds.set(sourceId, sourceKey); receiverIds.set(receiverId, receiverKey);
        if (previousSource) validSourceSpacings.push(distance(previousSource[0], previousSource[1], sx, sy)); if (previousReceiver) validReceiverSpacings.push(distance(previousReceiver[0], previousReceiver[1], rx, ry)); previousSource = [sx, sy]; previousReceiver = [rx, ry];
        const calculatedOffset = distance(sx, sy, rx, ry); if (units === "length") offsets.push(calculatedOffset); if (calculatedOffset <= (options.nearCoincidenceDistance ?? 0)) coincident.push(traceId);
      }
      if (scalar < -10_000 || scalar > 10_000) badScalar.push(traceId);
      const sourceElevation = table.sourceElevation[traceId] ?? 0; const receiverElevation = table.receiverElevation[traceId] ?? 0; if (sourceElevation === 0 && receiverElevation === 0) missingElevation.push(traceId); else { elevations.push(sourceElevation, receiverElevation); }
    }
    if (missing.length > 0) findings.push(finding("warning", "GEOMETRY_MISSING_COORDINATES", `${missing.length} traces have non-finite coordinates.`, missing, "Inspect source and receiver coordinate header fields."));
    if (zero.length > 0) findings.push(finding("warning", "GEOMETRY_ZERO_COORDINATES", `${zero.length} traces contain a zero source or receiver coordinate pair.`, zero, "Confirm whether zero denotes a missing acquisition fix."));
    if (badScalar.length > 0) findings.push(finding("warning", "GEOMETRY_SUSPICIOUS_SCALAR", `${badScalar.length} traces use unusually large coordinate scalars.`, badScalar, "Confirm the SEG-Y scalar convention and raw coordinate units."));
    if (unitDistribution.unknown > 0) findings.push(finding("warning", "GEOMETRY_UNIT_UNKNOWN", `${unitDistribution.unknown} traces do not declare coordinate units.`, Array.from({ length: table.traceCount }, (_, index) => index).filter((traceId) => table.coordinateUnits(traceId) === "unknown"), "Do not apply metre-specific QC thresholds until a coordinate reference system is known."));
    if (Object.values(unitDistribution).filter((count) => count > 0).length > 1) findings.push(finding("warning", "GEOMETRY_MIXED_UNITS", "Multiple coordinate-unit codes occur in the dataset.", Array.from({ length: table.traceCount }, (_, index) => index), "Split the dataset by coordinate convention or validate header normalization."));
    if (Object.keys(scalarDistribution).length > 1) findings.push(finding("info", "GEOMETRY_MIXED_SCALARS", "Multiple coordinate scalar conventions occur in the dataset.", Array.from({ length: table.traceCount }, (_, index) => index), "Review raw and scaled coordinate columns before combining surveys."));
    const duplicatedSources = [...sourcePositions.values()].filter((traces) => traces.length > 1).flat(); const duplicatedReceivers = [...receiverPositions.values()].filter((traces) => traces.length > 1).flat();
    if (duplicatedSources.length > 0) findings.push(finding("info", "GEOMETRY_DUPLICATE_SOURCE_POSITION", `${duplicatedSources.length} traces share a source position.`, duplicatedSources, "Confirm repeated shots are intentional."));
    if (duplicatedReceivers.length > 0) findings.push(finding("info", "GEOMETRY_DUPLICATE_RECEIVER_POSITION", `${duplicatedReceivers.length} traces share a receiver position.`, duplicatedReceivers, "Confirm repeated receiver positions are intentional."));
    if (conflictingSourceIds.length > 0) findings.push(finding("warning", "GEOMETRY_CONFLICTING_SOURCE_ID", "A source ID is associated with conflicting coordinates.", conflictingSourceIds, "Check source identifiers and coordinate headers."));
    if (conflictingReceiverIds.length > 0) findings.push(finding("warning", "GEOMETRY_CONFLICTING_RECEIVER_ID", "A receiver ID is associated with conflicting coordinates.", conflictingReceiverIds, "Check receiver identifiers and coordinate headers."));
    if (coincident.length > 0) findings.push(finding("warning", "GEOMETRY_SOURCE_RECEIVER_COINCIDENT", `${coincident.length} traces have coincident source and receiver coordinates.`, coincident, "Confirm zero-offset acquisition or missing coordinate values.", undefined, options.nearCoincidenceDistance ?? 0));
    if (missingElevation.length > 0) findings.push(finding("info", "GEOMETRY_MISSING_ELEVATION", `${missingElevation.length} traces have zero source and receiver elevations.`, missingElevation, "Confirm whether elevation values are absent or legitimately zero."));
    const offsetFraction = options.offsetDiscrepancyFraction ?? 0.05; const minimumOffsetDifference = options.minimumOffsetDiscrepancy ?? 5; const disagreements: number[] = [];
    for (let traceId = 0; traceId < table.traceCount; traceId += 1) {
      if (table.coordinateUnits(traceId) !== "length") continue;
      const headerOffset = table.headerOffsets[traceId] ?? 0; if (headerOffset === 0) continue;
      const calculated = distance(table.sourceX[traceId] ?? 0, table.sourceY[traceId] ?? 0, table.receiverX[traceId] ?? 0, table.receiverY[traceId] ?? 0);
      if (Math.abs(Math.abs(headerOffset) - calculated) > Math.max(minimumOffsetDifference, calculated * offsetFraction)) disagreements.push(traceId);
    }
    if (disagreements.length > 0) findings.push(finding("warning", "GEOMETRY_OFFSET_DISAGREEMENT", `${disagreements.length} header offsets disagree with coordinate-derived offsets.`, disagreements, "Verify coordinate units and offset sign convention.", undefined, offsetFraction));
    const medianSourceSpacing = median(validSourceSpacings); const jumpLimit = medianSourceSpacing === undefined ? undefined : medianSourceSpacing * (options.jumpMultiplier ?? 10); if (jumpLimit !== undefined && unitDistribution.length > 0) {
      const jumps: number[] = []; for (let traceId = 1; traceId < table.traceCount; traceId += 1) if (table.coordinateUnits(traceId) === "length" && distance(table.sourceX[traceId - 1] ?? 0, table.sourceY[traceId - 1] ?? 0, table.sourceX[traceId] ?? 0, table.sourceY[traceId] ?? 0) > jumpLimit) jumps.push(traceId);
      if (jumps.length > 0) findings.push(finding("warning", "GEOMETRY_LARGE_COORDINATE_JUMP", `${jumps.length} consecutive source positions exceed the configured jump threshold.`, jumps, "Check line breaks, coordinate units, and acquisition order.", undefined, jumpLimit));
    }
    const bounds = table.bounds(); const extentWidth = bounds === undefined ? 0 : bounds.maximumX - bounds.minimumX; const extentHeight = bounds === undefined ? 0 : bounds.maximumY - bounds.minimumY; if (bounds && (extentWidth === 0 || extentHeight === 0)) findings.push(finding("warning", "GEOMETRY_DEGENERATE_EXTENT", "Geometry is collinear or has a zero-width/zero-height extent.", Array.from({ length: table.traceCount }, (_, index) => index), "Use a line view or verify the coordinate columns."));
    const medianOffset = median(offsets); if (medianOffset !== undefined && medianOffset > 0) { const outliers: number[] = []; const multiplier = options.outlierOffsetMultiplier ?? 10; for (let traceId = 0; traceId < table.traceCount; traceId += 1) if (table.coordinateUnits(traceId) === "length" && distance(table.sourceX[traceId] ?? 0, table.sourceY[traceId] ?? 0, table.receiverX[traceId] ?? 0, table.receiverY[traceId] ?? 0) > medianOffset * multiplier) outliers.push(traceId); if (outliers.length > 0) findings.push(finding("warning", "GEOMETRY_OUTLIER_OFFSET", `${outliers.length} coordinate-derived offsets exceed ${multiplier}× the median.`, outliers, "Inspect survey breaks and coordinate units.", undefined, medianOffset * multiplier)); }
    const medianReceiverSpacing = median(validReceiverSpacings);
    const summary: GeometrySummary = { sourceCount: sourcePositions.size, receiverCount: receiverPositions.size, cmpCount: new Set(Array.from(table.cmpIds)).size, ...(bounds === undefined ? {} : { bounds }), ...(medianSourceSpacing === undefined ? {} : { medianSourceSpacing }), ...(medianReceiverSpacing === undefined ? {} : { medianReceiverSpacing }), ...(offsets.length === 0 ? {} : { offsetMinimum: Math.min(...offsets), offsetMaximum: Math.max(...offsets) }), ...(elevations.length === 0 ? {} : { elevationMinimum: Math.min(...elevations), elevationMaximum: Math.max(...elevations) }), missingCoordinateFraction: missing.length / table.traceCount, duplicateFraction: (duplicatedSources.length + duplicatedReceivers.length) / Math.max(1, table.traceCount * 2), coordinateUnits: unitDistribution, coordinateScalars: scalarDistribution };
    return { findings, summary };
  }
}
