import { downloadBlob } from "../../export/download";
import { BlobOutputSink } from "../../io/sink/output-sink";
import { SegyReader, type SegyDataset } from "../../io/segy";
import { BlobSource } from "../../io/source/blob-source";
import { SmartSoloWorkerConverter } from "../../workers/smartsolo-worker-converter";
import type { SmartSoloWorkerProgress } from "../../workers/smartsolo-protocol";

export interface SmartSoloConversionDialogOptions { readonly onConverted: (dataset: SegyDataset) => Promise<void>; }

function progressText(progress: SmartSoloWorkerProgress): string {
  const traces = progress.totalTraces > 0 ? ` ${progress.completedTraces}/${progress.totalTraces} traces` : "";
  const bytes = progress.completedBytes === undefined || progress.totalBytes === undefined ? "" : ` · ${Math.round(progress.completedBytes / Math.max(1, progress.totalBytes) * 100)}% bytes`;
  return `${progress.phase.replace(/-/g, " ")}${traces}${bytes}`;
}

/** Accessible browser workflow. The module worker owns parsing/decoding; the dialog owns cancellation and output state. */
export class SmartSoloConversionDialog {
  public constructor(private readonly options: SmartSoloConversionDialogOptions) {}

  public async open(file: File): Promise<void> {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form method="dialog" class="panel" aria-labelledby="smartsolo-title"><h2 id="smartsolo-title">Convert SmartSolo SEG-D 8058</h2><p id="smartsolo-status" role="status" aria-live="polite">Starting worker detection…</p><progress id="smartsolo-progress" max="1" value="0"></progress><pre id="smartsolo-summary"></pre><label>SEG-Y revision <select id="smartsolo-revision"><option value="1">1</option><option value="2">2</option></select></label><label>Text encoding <select id="smartsolo-text"><option value="ascii">ASCII</option><option value="ebcdic">EBCDIC</option></select></label><label>Endianness <select id="smartsolo-endian"><option value="big">Big endian</option><option value="little">Little endian</option></select></label><label>Coordinate scalar <select id="smartsolo-scalar"><option value="automatic">Automatic (-100 centimetres)</option><option value="preserve">Preserve legacy scalar</option></select></label><label><input id="smartsolo-aux" type="checkbox" checked> Include auxiliary traces when classified</label><label><input id="smartsolo-pilot" type="checkbox" checked> Include pilot traces when classified</label><p class="meta">Worker batches are limited to 4 MiB. The selected browser uses a bounded Blob fallback (512 MiB maximum); no local file is uploaded.</p><menu><button id="smartsolo-cancel" type="button">Cancel</button><button id="smartsolo-start" type="button" disabled>Convert and download SEG-Y</button><button id="smartsolo-close" value="cancel">Close</button></menu></form>`;
    document.body.append(dialog); dialog.showModal();
    const status = this.byId<HTMLElement>(dialog, "smartsolo-status"); const summary = this.byId<HTMLElement>(dialog, "smartsolo-summary"); const progress = this.byId<HTMLProgressElement>(dialog, "smartsolo-progress"); const start = this.byId<HTMLButtonElement>(dialog, "smartsolo-start"); const cancel = this.byId<HTMLButtonElement>(dialog, "smartsolo-cancel");
    const controller = new AbortController(); const converter = new SmartSoloWorkerConverter(); let completed = false; let active = true;
    const cancelWork = (): void => { if (!active) return; controller.abort(); converter.cancel(); status.textContent = "Cancelled. Any partial output was aborted."; start.disabled = true; };
    cancel.addEventListener("click", cancelWork); dialog.addEventListener("close", () => { if (!completed) { controller.abort(); converter.cancel(); } active = false; converter.dispose(); dialog.remove(); });
    const onProgress = (item: SmartSoloWorkerProgress): void => {
      if (!active || controller.signal.aborted) return;
      status.textContent = progressText(item); if (item.fraction !== undefined) progress.value = item.fraction;
    };
    try {
      const opened = await converter.open(file, { signal: controller.signal, onProgress });
      const preview = new DataView(opened.previewHeader.buffer);
      summary.textContent = `Supported SmartSolo 8058 revision ${opened.revision} · confidence ${Math.round(opened.detection.confidence * 100)}%\n${opened.traceCount} indexed traces; ${opened.sampleIntervalMicroseconds} µs interval\nFirst mapped FFID ${preview.getInt32(8, false)}, trace ${preview.getInt32(12, false)}\n${opened.diagnostics.length} diagnostic(s). Raw headers remain provenance data; undocumented fields are not inferred.`;
      status.textContent = "Detection and mapping preview complete."; progress.value = 0; start.disabled = false;
      start.addEventListener("click", () => void this.convert(converter, dialog, status, progress, start, cancel, controller, outputNameFor(file.name), () => active, () => { completed = true; }));
    } catch (error) { status.textContent = controller.signal.aborted ? "Cancelled before indexing completed." : error instanceof Error ? error.message : String(error); }
  }

  private async convert(converter: SmartSoloWorkerConverter, dialog: HTMLDialogElement, status: HTMLElement, progress: HTMLProgressElement, start: HTMLButtonElement, cancel: HTMLButtonElement, controller: AbortController, outputName: string, active: () => boolean, markCompleted: () => void): Promise<void> {
    start.disabled = true;
    const revision = Number(this.byId<HTMLSelectElement>(dialog, "smartsolo-revision").value) as 1 | 2;
    const textualEncoding = this.byId<HTMLSelectElement>(dialog, "smartsolo-text").value as "ascii" | "ebcdic";
    const outputEndianness = this.byId<HTMLSelectElement>(dialog, "smartsolo-endian").value as "big" | "little";
    const coordinateScalarMode = this.byId<HTMLSelectElement>(dialog, "smartsolo-scalar").value as "automatic" | "preserve";
    try {
      const sink = new BlobOutputSink("application/x-segy");
      const result = await converter.convert(sink, {
        outputRevision: revision, textualEncoding, outputEndianness, coordinateScalarMode,
        includeAuxiliaryTraces: this.byId<HTMLInputElement>(dialog, "smartsolo-aux").checked,
        includePilotTraces: this.byId<HTMLInputElement>(dialog, "smartsolo-pilot").checked,
        batchMemoryBytes: 4 * 1024 * 1024, signal: controller.signal,
        onWorkerProgress: (item) => { if (!active()) return; status.textContent = `${progressText(item)} · worker batch limit 4 MiB`; if (item.fraction !== undefined) progress.value = item.fraction; },
        onProgress: (completedTraces, totalTraces) => { if (!active()) return; status.textContent = `writing ${completedTraces}/${totalTraces} traces`; progress.value = totalTraces > 0 ? completedTraces / totalTraces : 0; }
      });
      if (!active()) return;
      const blob = sink.toBlob();
      downloadBlob(blob, outputName); status.textContent = `Complete: ${result.traceCount} traces (${Math.round(blob.size / 1024)} KiB). Opening local result…`;
      await this.options.onConverted(await SegyReader.open(new BlobSource(new File([blob], outputName))));
      markCompleted(); cancel.disabled = true; status.textContent = `Complete: ${result.traceCount} traces downloaded and opened locally.`;
    } catch (error) {
      status.textContent = controller.signal.aborted ? "Cancelled. No converted dataset was opened." : error instanceof Error ? error.message : String(error);
      start.disabled = false;
    }
  }

  private byId<T extends HTMLElement>(root: ParentNode, id: string): T { const value = root.querySelector<T>(`#${id}`); if (!value) throw new Error(`Missing SmartSolo dialog element #${id}.`); return value; }
}

function outputNameFor(name: string): string { return name.replace(/\.(segd|sgd)$/i, "") + ".sgy"; }
