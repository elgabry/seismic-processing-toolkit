import { downloadBlob } from "../../export/download";
import { BlobOutputSink } from "../../io/sink/output-sink";
import { SmartSolo8058Converter, SmartSolo8058Reader, mapSmartSoloTraceToSegyHeader, normalizeSmartSoloConversionOptions } from "../../io/segd/smartsolo8058";
import { BlobSource } from "../../io/source/blob-source";
import { SegyReader, type SegyDataset } from "../../io/segy";

export interface SmartSoloConversionDialogOptions { readonly onConverted: (dataset: SegyDataset) => Promise<void>; }

/** Browser-only workflow around the modular reader/converter; parsing stays in I/O modules. */
export class SmartSoloConversionDialog {
  public constructor(private readonly options: SmartSoloConversionDialogOptions) {}

  public async open(file: File): Promise<void> {
    const dialog = document.createElement("dialog"); dialog.innerHTML = `<form method="dialog" class="panel"><h2>Convert SmartSolo SEG-D 8058</h2><p id="smartsolo-status">Detecting format…</p><pre id="smartsolo-summary"></pre><label>SEG-Y revision <select id="smartsolo-revision"><option value="1">1</option><option value="2">2</option></select></label><label>Text encoding <select id="smartsolo-text"><option value="ascii">ASCII</option><option value="ebcdic">EBCDIC</option></select></label><label>Endianness <select id="smartsolo-endian"><option value="big">Big endian</option><option value="little">Little endian</option></select></label><label>Coordinate scalar <select id="smartsolo-scalar"><option value="automatic">Automatic (-100 centimetres)</option><option value="preserve">Preserve legacy scalar</option></select></label><menu><button value="cancel">Close</button><button id="smartsolo-start" type="button" disabled>Convert and download SEG-Y</button></menu></form>`;
    document.body.append(dialog); dialog.showModal();
    const status = this.byId<HTMLElement>(dialog, "smartsolo-status"); const summary = this.byId<HTMLElement>(dialog, "smartsolo-summary"); const start = this.byId<HTMLButtonElement>(dialog, "smartsolo-start"); const source = new BlobSource(file); const controller = new AbortController(); dialog.addEventListener("close", () => { controller.abort(); dialog.remove(); });
    try {
      const reader = await SmartSolo8058Reader.open(source, { signal: controller.signal, onProgress: (progress) => { status.textContent = `Indexed ${progress.traceCount} traces (${Math.round(progress.bytesScanned / Math.max(1, progress.totalBytes) * 100)}%).`; } });
      const mapped = mapSmartSoloTraceToSegyHeader(reader, 0, 0, normalizeSmartSoloConversionOptions()); const preview = new DataView(mapped.bytes.buffer); summary.textContent = `Supported SmartSolo 8058 revision ${reader.headers.revision}\n${reader.traceCount} indexed traces; ${reader.headers.sampleIntervalMicroseconds} µs interval\nGather type ${reader.headers.gatherType}; source point ${reader.headers.sourcePoint}\nFirst mapped FFID ${preview.getInt32(8, false)}, trace ${preview.getInt32(12, false)}\n${reader.diagnostics.length} diagnostic(s); raw headers retained in model.`; status.textContent = "Detection and mapping preview complete."; start.disabled = false;
      start.addEventListener("click", () => void this.convert(reader, dialog, status, start, controller));
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
  }

  private async convert(reader: SmartSolo8058Reader, dialog: HTMLDialogElement, status: HTMLElement, start: HTMLButtonElement, controller: AbortController): Promise<void> {
    start.disabled = true; const revision = Number(this.byId<HTMLSelectElement>(dialog, "smartsolo-revision").value) as 1 | 2; const textualEncoding = this.byId<HTMLSelectElement>(dialog, "smartsolo-text").value as "ascii" | "ebcdic"; const outputEndianness = this.byId<HTMLSelectElement>(dialog, "smartsolo-endian").value as "big" | "little"; const coordinateScalarMode = this.byId<HTMLSelectElement>(dialog, "smartsolo-scalar").value as "automatic" | "preserve";
    try {
      const sink = new BlobOutputSink("application/x-segy"); const result = await SmartSolo8058Converter.convert(reader, sink, { outputRevision: revision, textualEncoding, outputEndianness, coordinateScalarMode, signal: controller.signal, onProgress: (completed, total) => { status.textContent = `Converted ${completed}/${total} traces…`; } }); const blob = sink.toBlob(); const outputName = reader.source.name.replace(/\.(segd|sgd)$/i, "") + ".sgy"; downloadBlob(blob, outputName); status.textContent = `Converted ${result.traceCount} traces (${Math.round(result.estimatedBytes / 1024)} KiB estimate). Opening local result…`; await this.options.onConverted(await SegyReader.open(new BlobSource(new File([blob], outputName)))); dialog.close();
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); start.disabled = false; }
  }
  private byId<T extends HTMLElement>(root: ParentNode, id: string): T { const value = root.querySelector<T>(`#${id}`); if (!value) throw new Error(`Missing SmartSolo dialog element #${id}.`); return value; }
}
