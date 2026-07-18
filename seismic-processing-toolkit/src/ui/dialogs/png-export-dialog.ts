import { downloadBlob } from "../../export/download";
import { MapExportRenderer, PlotExportRenderer, validatePngDimensions } from "../../export/png";
import { GeometryBuilder } from "../../geometry";
import type { SegyDataset } from "../../io/segy";
import type { WiggleView } from "../../visualization/wiggle-renderer";

export interface PngExportDialogOptions { readonly dataset: SegyDataset; readonly view: WiggleView; readonly visibleTraceIds: Uint32Array; }
type PngTarget = "wiggle" | "variable-area" | "density" | "map";

function outputName(dataset: SegyDataset, target: PngTarget): string { return `${dataset.name.replace(/\.[^.]+$/, "")}_${target}.png`; }

/** PNG settings are rendered from immutable plot/map models, never by screenshotting or resizing the live canvas. */
export class PngExportDialog {
  public constructor(private readonly options: PngExportDialogOptions) {}

  public open(): void {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form method="dialog" class="panel" aria-labelledby="png-export-title"><h2 id="png-export-title">Export local PNG</h2><label>Target <select id="png-target"><option value="wiggle">Wiggle plot</option><option value="variable-area">Variable-area plot</option><option value="density">Density plot</option><option value="map">Geometry map</option></select></label><label>Preset <select id="png-preset"><option value="1600x1000">1600 × 1000</option><option value="1920x1080">1920 × 1080</option><option value="2560x1440">2560 × 1440</option><option value="custom">User-defined</option></select></label><label>Width <input id="png-width" type="number" min="1" value="1600"></label><label>Height <input id="png-height" type="number" min="1" value="1000"></label><label>Background <select id="png-background"><option value="transparent">Transparent</option><option value="#071016">Opaque dark</option><option value="#ffffff">Opaque white</option></select></label><label><input id="png-title" type="checkbox" checked> Include title</label><label><input id="png-current" type="checkbox" checked> Current viewport / visible traces</label><label><input id="png-legend" type="checkbox" checked> Include map or amplitude legend</label><p id="png-status" role="status" aria-live="polite" class="meta">Dimensions are validated before allocating a fresh export canvas. The live viewport is not changed.</p><menu><button id="png-export" type="button">Export PNG</button><button value="cancel">Close</button></menu></form>`;
    document.body.append(dialog); dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
    this.byId<HTMLSelectElement>(dialog, "png-preset").addEventListener("change", (event) => { const [width, height] = (event.currentTarget as HTMLSelectElement).value.split("x").map(Number); if (Number.isFinite(width) && Number.isFinite(height)) { this.byId<HTMLInputElement>(dialog, "png-width").value = String(width); this.byId<HTMLInputElement>(dialog, "png-height").value = String(height); } });
    this.byId<HTMLButtonElement>(dialog, "png-export").addEventListener("click", () => void this.export(dialog));
  }

  private async export(dialog: HTMLDialogElement): Promise<void> {
    const status = this.byId<HTMLElement>(dialog, "png-status"); const button = this.byId<HTMLButtonElement>(dialog, "png-export"); const target = this.byId<HTMLSelectElement>(dialog, "png-target").value as PngTarget; const width = Number(this.byId<HTMLInputElement>(dialog, "png-width").value); const height = Number(this.byId<HTMLInputElement>(dialog, "png-height").value); const backgroundChoice = this.byId<HTMLSelectElement>(dialog, "png-background").value; const background = backgroundChoice === "transparent" ? "transparent" : backgroundChoice;
    try { validatePngDimensions({ width, height, background }); } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); return; }
    button.disabled = true; status.textContent = "Preparing deterministic PNG render…";
    try {
      let blob: Blob;
      if (target === "map") {
        const table = await GeometryBuilder.fromSegy(this.options.dataset);
        blob = await MapExportRenderer.export(table, { width, height, background, includeLegend: this.byId<HTMLInputElement>(dialog, "png-legend").checked });
      } else {
        const traceIds = this.byId<HTMLInputElement>(dialog, "png-current").checked ? this.options.visibleTraceIds : Uint32Array.from({ length: this.options.dataset.traceCount }, (_, index) => index);
        const traces = await Promise.all(Array.from(traceIds, async (traceId) => ({ traceId, samples: await this.options.dataset.traces.readTrace(traceId) })));
        const first = traceIds[0] ?? 0; const interval = (this.options.dataset.traceIndex.sampleIntervalsMicroseconds[first] ?? 1000) / 1_000_000;
        blob = await PlotExportRenderer.export({ width, height, background, traces, sampleIntervalSeconds: interval, mode: target, gain: this.options.view.gain, clip: this.options.view.clip, timeStartSeconds: this.options.view.timeStartSeconds, timeEndSeconds: this.options.view.timeEndSeconds, ...(this.byId<HTMLInputElement>(dialog, "png-title").checked ? { title: this.options.dataset.name } : {}) });
      }
      downloadBlob(blob, outputName(this.options.dataset, target)); status.textContent = `Complete: ${width} × ${height} PNG downloaded locally.`;
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); button.disabled = false; }
  }

  private byId<T extends HTMLElement>(root: ParentNode, id: string): T { const value = root.querySelector<T>(`#${id}`); if (!value) throw new Error(`Missing PNG dialog control #${id}.`); return value; }
}
