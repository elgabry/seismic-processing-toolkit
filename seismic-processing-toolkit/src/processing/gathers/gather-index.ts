import type { SegyDataset } from "../../io/segy/segy-dataset";

export type GatherKind = "shot" | "receiver" | "offset" | "cmp" | "header" | "inline" | "crossline";
export interface GatherDefinition { readonly kind: GatherKind; readonly headerField?: "fieldRecordNumbers" | "traceNumbersWithinFieldRecord" | "cdpNumbers"; readonly offsetBin?: number; readonly source: "header" | "coordinates" | "auto"; readonly secondarySort?: "offset" | "trace"; readonly reverse?: boolean; }
export interface Gather { readonly key: string; readonly traceIds: Uint32Array; readonly diagnostics: readonly string[]; }
/** Gather construction is an index operation; trace sample arrays are never copied. */
export class GatherIndex {
  public constructor(private readonly gathers: readonly Gather[]) {}
  public all(): readonly Gather[] { return this.gathers; }
  public get(key: string): Gather | undefined { return this.gathers.find((item) => item.key === key); }
  public static async build(dataset: SegyDataset, definition: GatherDefinition, signal?: AbortSignal): Promise<GatherIndex> {
    const groups = new Map<string, number[]>(); const notes = new Map<string, string[]>();
    for (let traceId = 0; traceId < dataset.traceCount; traceId += 1) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const header = await dataset.traces.readHeader(traceId, signal); let key: string; const diagnostic: string[] = [];
      if (definition.kind === "shot") key = String(header.raw("fieldRecordNumber"));
      else if (definition.kind === "receiver") key = `${header.scaled("receiverX").toFixed(3)},${header.scaled("receiverY").toFixed(3)}`;
      else if (definition.kind === "cmp") { const coordinateUnits = header.raw("coordinateUnits"); if (coordinateUnits !== 1) diagnostic.push("CMP coordinate calculation is not guaranteed to be metres because coordinate units are unknown or angular."); key = `${((header.scaled("sourceX") + header.scaled("receiverX")) / 2).toFixed(3)},${((header.scaled("sourceY") + header.scaled("receiverY")) / 2).toFixed(3)}`; }
      else if (definition.kind === "offset") { const rawOffset = header.raw("offset"); const coordinateOffset = Math.hypot(header.scaled("receiverX") - header.scaled("sourceX"), header.scaled("receiverY") - header.scaled("sourceY")); const chosen = definition.source === "coordinates" ? coordinateOffset : definition.source === "header" ? rawOffset : rawOffset !== 0 ? rawOffset : coordinateOffset; if (rawOffset !== 0 && coordinateOffset > 0 && Math.abs(Math.abs(rawOffset) - coordinateOffset) > Math.max(5, coordinateOffset * 0.05)) diagnostic.push("Header and coordinate-derived offsets differ by more than 5% or 5 coordinate units."); const bin = definition.offsetBin ?? 1; key = String(Math.round(chosen / bin) * bin); }
      else if (definition.kind === "inline") key = String(header.raw("inline"));
      else if (definition.kind === "crossline") key = String(header.raw("crossline"));
      else { const column = definition.headerField ?? "cdpNumbers"; const values = column === "fieldRecordNumbers" ? dataset.traceIndex.fieldRecordNumbers : column === "traceNumbersWithinFieldRecord" ? dataset.traceIndex.traceNumbersWithinFieldRecord : dataset.traceIndex.cdpNumbers; key = String(values[traceId] ?? 0); }
      const list = groups.get(key) ?? []; list.push(traceId); groups.set(key, list); notes.set(key, [...(notes.get(key) ?? []), ...diagnostic]);
    }
    const gathers: Gather[] = [...groups.entries()].map(([key, ids]) => ({ key, traceIds: Uint32Array.from(ids.sort((left, right) => (definition.secondarySort === "trace" ? (dataset.traceIndex.traceNumbersWithinFieldRecord[left] ?? 0) - (dataset.traceIndex.traceNumbersWithinFieldRecord[right] ?? 0) : (dataset.traceIndex.offsets[left] ?? 0) - (dataset.traceIndex.offsets[right] ?? 0)) || left - right)), diagnostics: notes.get(key) ?? [] }));
    gathers.sort((left, right) => left.key.localeCompare(right.key, undefined, { numeric: true })); if (definition.reverse) gathers.reverse(); return new GatherIndex(gathers);
  }
}
