import { downloadBlob } from "../../export/download";
import { MapExportRenderer } from "../../export/png";
import { GeometryBuilder, GeometryQcAnalyzer } from "../../geometry";
import type { GeometrySeverity } from "../../geometry/types";
import type { SegyDataset } from "../../io/segy";
import { GeometryMapRenderer, MapSpatialIndex, fitViewport, panViewport, screenRectToWorld, screenToWorld, viewportForScreenRect, zoomViewportAt, type MapRenderOptions, type ScreenPoint } from "../../visualization/map";

export interface GeometryMapPanelOptions { readonly onSelectTrace: (traceId: number) => void; readonly initialTraceId?: number; }
type GestureMode = "pan" | "box-zoom" | "box-select";
interface Gesture { readonly start: ScreenPoint; last: ScreenPoint; readonly pointerId: number; }

function visibleFindingTraces(findings: readonly { readonly severity: GeometrySeverity; readonly traceIds: Uint32Array }[], severity: "all" | GeometrySeverity): Set<number> {
  return new Set(findings.filter((item) => severity === "all" || item.severity === severity).flatMap((item) => Array.from(item.traceIds)));
}

/** Offline map controls are deliberately local to this dialog; only committed selections flow back to the application controller. */
export class GeometryMapPanel {
  public constructor(private readonly options: GeometryMapPanelOptions) {}

  public async open(dataset: SegyDataset): Promise<void> {
    const table = await GeometryBuilder.fromSegy(dataset); const bounds = table.bounds(); if (!bounds) throw new Error("No finite coordinates are available for the geometry map.");
    const qc = GeometryQcAnalyzer.analyze(table); const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form method="dialog" class="panel" aria-labelledby="geometry-title"><h2 id="geometry-title">Offline geometry map and coordinate QC</h2><p id="geometry-note"></p><div class="controls" aria-label="Map controls"><button id="map-fit" type="button">Fit</button><button id="map-reset" type="button">Reset</button><label>Gesture <select id="map-gesture"><option value="pan">Pan / select</option><option value="box-zoom">Box zoom</option><option value="box-select">Box select</option></select></label><button id="map-clear" type="button">Clear selection</button><label><input id="map-source" type="checkbox" checked> Sources</label><label><input id="map-receiver" type="checkbox" checked> Receivers</label><label><input id="map-cmp" type="checkbox"> CMPs</label><label>Point size <input id="map-size" type="range" min="1" max="8" value="3"></label><label>Colour <select id="map-colour"><option value="role">Role</option><option value="offset">Offset</option><option value="sourceId">Source ID</option><option value="receiverId">Receiver ID</option><option value="cmpId">CMP ID</option><option value="qc">QC severity</option></select></label><label>QC <select id="map-qc"><option value="all">All findings</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option></select></label></div><canvas id="geometry-map" width="900" height="540" aria-label="Offline geometry map" data-testid="geometry-map"></canvas><p id="geometry-hover" class="meta" aria-live="polite">Hover a source, receiver, or CMP point for local-coordinate details.</p><p id="geometry-legend" class="meta"></p><select id="geometry-finding" aria-label="Highlight QC finding"><option value="">Highlight a QC finding</option>${qc.findings.map((finding, index) => `<option value="${index}">[${finding.severity}] ${finding.code}</option>`).join("")}</select><pre id="geometry-qc"></pre><menu><button id="geometry-png" type="button">Export current map PNG</button><button value="cancel">Close</button></menu></form>`;
    document.body.append(dialog); dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
    const canvas = this.byId<HTMLCanvasElement>(dialog, "geometry-map"); const note = this.byId<HTMLElement>(dialog, "geometry-note"); const qcText = this.byId<HTMLElement>(dialog, "geometry-qc"); const hover = this.byId<HTMLElement>(dialog, "geometry-hover"); const legend = this.byId<HTMLElement>(dialog, "geometry-legend"); const context = canvas.getContext("2d"); if (!context) throw new Error("Geometry map canvas is unavailable.");
    const initialViewport = fitViewport(bounds, canvas.width, canvas.height); let viewport = initialViewport; const renderer = new GeometryMapRenderer(); const spatial = new MapSpatialIndex(table, ["source", "receiver", "cmp"]); const selected = new Set<number>(this.options.initialTraceId === undefined ? [] : [this.options.initialTraceId]); let severity: "all" | GeometrySeverity = "all"; let highlightedFindings = visibleFindingTraces(qc.findings, severity); let gestureMode: GestureMode = "pan"; let gesture: Gesture | undefined;
    const checked = (id: string): boolean => this.byId<HTMLInputElement>(dialog, id).checked;
    const render = (): void => {
      const colorBy = this.byId<HTMLSelectElement>(dialog, "map-colour").value as NonNullable<MapRenderOptions["colorBy"]>;
      const options: MapRenderOptions = { width: canvas.width, height: canvas.height, pointRadius: Number(this.byId<HTMLInputElement>(dialog, "map-size").value), sourcesVisible: checked("map-source"), receiversVisible: checked("map-receiver"), cmpsVisible: checked("map-cmp"), selectedTraceIds: selected, findingTraceIds: highlightedFindings, colorBy };
      renderer.render(context, table, viewport, options); legend.textContent = `Colour: ${this.byId<HTMLSelectElement>(dialog, "map-colour").selectedOptions[0]?.textContent ?? "Role"}. Local coordinates remain local; no basemap or reprojection is used.`;
    };
    const rectangle = (): { readonly start: ScreenPoint; readonly end: ScreenPoint } | undefined => gesture && gestureMode !== "pan" ? { start: gesture.start, end: gesture.last } : undefined;
    const drawGesture = (): void => { const box = rectangle(); if (!box) return; context.save(); context.setLineDash([5, 4]); context.strokeStyle = "#f4b942"; context.strokeRect(Math.min(box.start.x, box.end.x), Math.min(box.start.y, box.end.y), Math.abs(box.end.x - box.start.x), Math.abs(box.end.y - box.start.y)); context.restore(); };
    const selectHit = (traceId: number, additive: boolean): void => { if (!additive) selected.clear(); selected.add(traceId); this.options.onSelectTrace(traceId); render(); };
    render(); note.textContent = `${qc.summary.sourceCount} source positions, ${qc.summary.receiverCount} receiver positions. ${qc.findings.length} structured coordinate-QC finding(s).`; qcText.textContent = qc.findings.map((finding) => `[${finding.severity}] ${finding.code}: ${finding.message}`).join("\n") || "No coordinate-QC findings.";
    const rerenderControls = (): void => render(); ["map-source", "map-receiver", "map-cmp", "map-size", "map-colour"].forEach((id) => this.byId(dialog, id).addEventListener("input", rerenderControls));
    this.byId<HTMLSelectElement>(dialog, "map-gesture").addEventListener("change", (event) => { gestureMode = (event.currentTarget as HTMLSelectElement).value as GestureMode; });
    this.byId<HTMLSelectElement>(dialog, "map-qc").addEventListener("change", (event) => { severity = (event.currentTarget as HTMLSelectElement).value as "all" | GeometrySeverity; highlightedFindings = visibleFindingTraces(qc.findings, severity); render(); });
    this.byId<HTMLSelectElement>(dialog, "geometry-finding").addEventListener("change", (event) => { const index = Number((event.currentTarget as HTMLSelectElement).value); if (!Number.isInteger(index) || !qc.findings[index]) return; highlightedFindings = new Set(qc.findings[index]?.traceIds); const first = qc.findings[index]?.traceIds[0]; if (first !== undefined) selectHit(first, false); else render(); });
    this.byId<HTMLButtonElement>(dialog, "map-fit").addEventListener("click", () => { viewport = fitViewport(bounds, canvas.width, canvas.height); render(); });
    this.byId<HTMLButtonElement>(dialog, "map-reset").addEventListener("click", () => { viewport = initialViewport; render(); });
    this.byId<HTMLButtonElement>(dialog, "map-clear").addEventListener("click", () => { selected.clear(); render(); });
    canvas.addEventListener("pointerdown", (event) => { gesture = { start: { x: event.offsetX, y: event.offsetY }, last: { x: event.offsetX, y: event.offsetY }, pointerId: event.pointerId }; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener("pointermove", (event) => {
      if (gesture?.pointerId === event.pointerId) { const next = { x: event.offsetX, y: event.offsetY }; if (gestureMode === "pan") { viewport = panViewport(viewport, next.x - gesture.last.x, next.y - gesture.last.y); } gesture.last = next; render(); drawGesture(); return; }
      const world = screenToWorld({ x: event.offsetX, y: event.offsetY }, viewport, canvas.width, canvas.height); const hit = spatial.hitTest(world.x, world.y, viewport, canvas.width, canvas.height); if (!hit) { hover.textContent = "No map point at cursor."; return; }
      const point = table.point(hit.traceId, hit.role); hover.textContent = `Trace ${hit.traceId + 1} ${hit.role}; X=${point.x}, Y=${point.y}, Z=${point.z ?? ""}; units=${point.coordinateUnits}; scalar=${point.coordinateScalar}; header offset=${table.headerOffsets[hit.traceId] ?? ""}.`;
    });
    canvas.addEventListener("pointerup", (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const completed = gesture; gesture = undefined; const totalMovement = Math.hypot(event.offsetX - completed.start.x, event.offsetY - completed.start.y);
      if (gestureMode === "box-zoom" && totalMovement >= 3) { viewport = viewportForScreenRect({ start: completed.start, end: { x: event.offsetX, y: event.offsetY } }, viewport, canvas.width, canvas.height); render(); return; }
      if (gestureMode === "box-select" && totalMovement >= 3) { const ids = spatial.tracesInBox(screenRectToWorld({ start: completed.start, end: { x: event.offsetX, y: event.offsetY } }, viewport, canvas.width, canvas.height)); if (!event.shiftKey) selected.clear(); for (const id of ids) selected.add(id); const first = ids[0]; if (first !== undefined) this.options.onSelectTrace(first); render(); return; }
      if (totalMovement >= 3) { render(); return; } // Movement is measured from original pointer-down, preventing drag-release selection.
      const world = screenToWorld({ x: event.offsetX, y: event.offsetY }, viewport, canvas.width, canvas.height); const hit = spatial.hitTest(world.x, world.y, viewport, canvas.width, canvas.height); if (hit) selectHit(hit.traceId, event.shiftKey); else render();
    });
    canvas.addEventListener("wheel", (event) => { event.preventDefault(); viewport = zoomViewportAt(viewport, { x: event.offsetX, y: event.offsetY }, event.deltaY < 0 ? 1.25 : 0.8, canvas.width, canvas.height); render(); }, { passive: false });
    dialog.addEventListener("keydown", (event) => { if (event.key === "Escape" && gesture) { gesture = undefined; render(); event.preventDefault(); } });
    this.byId<HTMLButtonElement>(dialog, "geometry-png").addEventListener("click", () => void MapExportRenderer.export(table, { width: canvas.width, height: canvas.height, viewport, selectedTraceIds: selected, findingTraceIds: highlightedFindings }).then((blob) => downloadBlob(blob, "geometry-map.png")));
  }

  private byId<T extends HTMLElement>(root: ParentNode, id: string): T { const value = root.querySelector<T>(`#${id}`); if (!value) throw new Error(`Missing geometry panel element #${id}.`); return value; }
}
