import { downloadBlob } from "../../export/download";
import { GatherCsvExporter, GeometryCsvExporter, TraceHeaderCsvExporter, TraceSampleCsvExporter } from "../../export/csv";
import { BlobOutputSink } from "../../io/sink/output-sink";
import type { SegyDataset } from "../../io/segy";
import { GeometryBuilder } from "../../geometry";
import { GatherIndex } from "../../processing/gathers/gather-index";

export interface CsvExportDialogOptions { readonly dataset: SegyDataset; readonly selectedTraceId: number; readonly visibleTraceIds: Uint32Array; }
type ExportKind = "headers" | "samples" | "geometry" | "gather";
type Scope = "selected" | "visible" | "range" | "all";

function traceRange(dataset: SegyDataset, start: number, end: number): Uint32Array {
  const first = Math.max(0, Math.min(dataset.traceCount - 1, start - 1)); const last = Math.max(first, Math.min(dataset.traceCount - 1, end - 1));
  return Uint32Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
function selectedIds(options: CsvExportDialogOptions, scope: Scope, start: number, end: number): Uint32Array {
  if (scope === "selected") return new Uint32Array([options.selectedTraceId]);
  if (scope === "visible") return options.visibleTraceIds;
  if (scope === "range") return traceRange(options.dataset, start, end);
  return Uint32Array.from({ length: options.dataset.traceCount }, (_, index) => index);
}
function nameFor(dataset: SegyDataset, kind: ExportKind): string { return `${dataset.name.replace(/\.[^.]+$/, "")}_${kind}.csv`; }

/** Dialog composes existing streaming exporters; it never buffers a survey-sized CSV in the DOM or a JavaScript string. */
export class CsvExportDialog {
  public constructor(private readonly options: CsvExportDialogOptions) {}

  public open(): void {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form method="dialog" class="panel" aria-labelledby="csv-export-title"><h2 id="csv-export-title">Export local CSV</h2><label>Export <select id="csv-kind"><option value="headers">Trace headers</option><option value="samples">Trace samples</option><option value="geometry">Geometry</option><option value="gather">Gather index</option></select></label><label>Scope <select id="csv-scope"><option value="selected">Selected trace</option><option value="visible">Visible traces</option><option value="range">Explicit trace range</option><option value="all">Entire dataset</option></select></label><label>Range start <input id="csv-start" type="number" min="1" value="1"></label><label>Range end <input id="csv-end" type="number" min="1" value="${this.options.dataset.traceCount}"></label><label>Sample layout <select id="csv-layout"><option value="long">Long</option><option value="wide">Wide (small scopes)</option></select></label><label>Delimiter <select id="csv-delimiter"><option value=",">Comma</option><option value="\t">Tab</option></select></label><label>Line ending <select id="csv-ending"><option value="crlf">CRLF</option><option value="lf">LF</option></select></label><label>Precision <input id="csv-precision" type="number" min="0" max="15" value="6"></label><label><input id="csv-header" type="checkbox" checked> Include header row</label><label><input id="csv-scaled" type="checkbox" checked> Include scaled coordinates</label><label><input id="csv-qc" type="checkbox" checked> Include QC fields when available</label><p id="csv-status" role="status" aria-live="polite" class="meta">Exports stream into a bounded Blob fallback (512 MiB maximum). Wide layout is rejected when unsafe.</p><menu><button id="csv-cancel" type="button">Cancel</button><button id="csv-export" type="button">Export CSV</button><button value="cancel">Close</button></menu></form>`;
    document.body.append(dialog); dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
    const status = this.byId<HTMLElement>(dialog, "csv-status"); const controller = new AbortController(); const exportButton = this.byId<HTMLButtonElement>(dialog, "csv-export");
    this.byId<HTMLButtonElement>(dialog, "csv-cancel").addEventListener("click", () => { controller.abort(); status.textContent = "Cancellation requested; streamed output will be aborted."; });
    exportButton.addEventListener("click", () => void this.export(dialog, status, exportButton, controller));
  }

  private async export(dialog: HTMLDialogElement, status: HTMLElement, exportButton: HTMLButtonElement, controller: AbortController): Promise<void> {
    const kind = this.byId<HTMLSelectElement>(dialog, "csv-kind").value as ExportKind; const scope = this.byId<HTMLSelectElement>(dialog, "csv-scope").value as Scope; const start = Number(this.byId<HTMLInputElement>(dialog, "csv-start").value); const end = Number(this.byId<HTMLInputElement>(dialog, "csv-end").value); const traceIds = selectedIds(this.options, scope, start, end);
    const delimiter = this.byId<HTMLSelectElement>(dialog, "csv-delimiter").value as "," | "\t"; const lineEnding = this.byId<HTMLSelectElement>(dialog, "csv-ending").value === "lf" ? "\n" : "\r\n"; const numericPrecision = Number(this.byId<HTMLInputElement>(dialog, "csv-precision").value); const includeHeader = this.byId<HTMLInputElement>(dialog, "csv-header").checked;
    if (!Number.isInteger(numericPrecision) || numericPrecision < 0 || numericPrecision > 15) { status.textContent = "Precision must be an integer from 0 to 15."; return; }
    if (scope === "range" && (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start)) { status.textContent = "Specify an inclusive valid trace range."; return; }
    exportButton.disabled = true; const sink = new BlobOutputSink("text/csv"); const common = { delimiter, lineEnding, numericPrecision, includeHeader, signal: controller.signal, onProgress: ({ rowsWritten }: { readonly rowsWritten: number }) => { status.textContent = `Streaming ${rowsWritten} CSV rows…`; } } as const;
    try {
      if (kind === "headers") await TraceHeaderCsvExporter.export(this.options.dataset, sink, { ...common, traceIds, includeScaledCoordinates: this.byId<HTMLInputElement>(dialog, "csv-scaled").checked });
      else if (kind === "samples") await TraceSampleCsvExporter.export(this.options.dataset, sink, { ...common, traceIds, format: this.byId<HTMLSelectElement>(dialog, "csv-layout").value as "long" | "wide" });
      else if (kind === "geometry") await GeometryCsvExporter.export(await GeometryBuilder.fromSegy(this.options.dataset, controller.signal), sink, { ...common });
      else { const gather = (await GatherIndex.build(this.options.dataset, { kind: "header", source: "header", headerField: "fieldRecordNumbers", secondarySort: "trace" }, controller.signal)).all()[0]; if (!gather) throw new Error("The dataset has no gather entries to export."); await GatherCsvExporter.export(gather, sink, common); }
      const blob = sink.toBlob(); downloadBlob(blob, nameFor(this.options.dataset, kind)); status.textContent = `Complete: ${Math.round(blob.size / 1024)} KiB downloaded locally.`;
    } catch (error) { status.textContent = controller.signal.aborted ? "Cancelled; partial output was aborted." : error instanceof Error ? error.message : String(error); exportButton.disabled = false; }
  }

  private byId<T extends HTMLElement>(root: ParentNode, id: string): T { const value = root.querySelector<T>(`#${id}`); if (!value) throw new Error(`Missing CSV dialog control #${id}.`); return value; }
}
