import { downloadBlob } from "../../export/download";
import { BlobOutputSink } from "../../io/sink/output-sink";
import { SegyReader, SegyWriter, type SegyDataset } from "../../io/segy";
import { BlobSource } from "../../io/source/blob-source";
import { SweepReaderRegistry } from "../../io/sweep/sweep-reader-registry";
import type { FdSweepDeconvolutionOptions } from "../../processing/vibroseis/fd-sweep-deconvolution";
import type { SweepSignal } from "../../sweep/sweep-signal";
import { FdsdWorkerClient } from "../../workers/fdsd-worker-client";

export interface SweepCorrelationDialogOptions {
  readonly dataset: SegyDataset;
  readonly onCorrelated: (dataset: SegyDataset) => Promise<void>;
}

function outputNameFor(name: string): string { return `${name.replace(/\.(sgy|segy)$/i, "")}_fdsd.sgy`; }

/** Browser workflow for Frequency Domain Sweep Deconvolution (FDSD). */
export class SweepCorrelationDialog {
  public constructor(private readonly options: SweepCorrelationDialogOptions) {}

  public open(): void {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form method="dialog" class="panel" aria-labelledby="fdsd-title"><h2 id="fdsd-title">Frequency Domain Sweep Deconvolution</h2><p class="meta">FDSD removes the pilot by stabilized complex spectral division. Unlike cross-correlation, it does not form a Klauder wavelet.</p><ol class="meta"><li>Choose a local pilot sweep.</li><li>Confirm its sample interval.</li><li>Set the stabilization and optional passband.</li><li>Run FDSD.</li></ol><input id="sweep-file" data-testid="sweep-file-input" type="file" accept=".csv,.txt,.dat,.wav,.sgy,.segy,.tar" hidden><p><button id="sweep-select" data-testid="select-sweep" type="button">Choose pilot sweep…</button></p><p class="meta">Supported local files: two-column time/amplitude CSV or text, WAV, SEG-Y auxiliary traces, and TAR archives. A one-column text file defaults to a 1 ms interval.</p><label id="sweep-choice-label" hidden>Sweep candidate <select id="sweep-choice"></select></label><pre id="sweep-summary" class="meta">No pilot sweep selected.</pre><div class="controls"><label class="grid">Water level (%) <input id="fdsd-water-level" type="number" min="0.0001" max="100" step="0.01" value="1" aria-describedby="fdsd-water-help"></label><p id="fdsd-water-help" class="meta">Stabilization as a fraction of maximum pilot spectral power. Increase it if noise is amplified.</p><label class="grid">Low-cut (Hz) <input id="fdsd-low-cut" type="number" min="0" step="0.1" placeholder="0"></label><label class="grid">High-cut (Hz) <input id="fdsd-high-cut" type="number" min="0" step="0.1" placeholder="Nyquist"></label><label class="grid">Passband taper (Hz) <input id="fdsd-taper" type="number" min="0" step="0.1" value="0"></label></div><p id="sweep-status" role="status" aria-live="polite">The opened SEG-Y is unchanged until FDSD completes.</p><progress id="sweep-progress" max="1" value="0"></progress><menu><button id="sweep-cancel" type="button">Cancel</button><button id="sweep-run" data-testid="run-sweep-correlation" type="button" disabled>Run FDSD and download SEG-Y</button><button id="sweep-close" value="cancel">Close</button></menu></form>`;
    document.body.append(dialog);
    dialog.showModal();

    const fileInput = this.byId<HTMLInputElement>(dialog, "sweep-file");
    const select = this.byId<HTMLSelectElement>(dialog, "sweep-choice");
    const selectLabel = this.byId<HTMLElement>(dialog, "sweep-choice-label");
    const summary = this.byId<HTMLElement>(dialog, "sweep-summary");
    const status = this.byId<HTMLElement>(dialog, "sweep-status");
    const progress = this.byId<HTMLProgressElement>(dialog, "sweep-progress");
    const run = this.byId<HTMLButtonElement>(dialog, "sweep-run");
    const cancel = this.byId<HTMLButtonElement>(dialog, "sweep-cancel");
    const controller = new AbortController();
    const registry = new SweepReaderRegistry();
    let candidates: readonly SweepSignal[] = [];
    let active = false;

    const selectedSweep = (): SweepSignal | undefined => candidates[Number(select.value)];
    const updateSummary = (): void => {
      const sweep = selectedSweep();
      if (!sweep) { summary.textContent = "No pilot sweep selected."; run.disabled = true; return; }
      summary.textContent = `${sweep.name}\n${sweep.samples.length.toLocaleString()} samples · ${(sweep.sampleIntervalSeconds * 1_000_000).toLocaleString()} µs interval · ${sweep.units}\nSource: ${sweep.source}`;
      run.disabled = active;
    };
    this.byId<HTMLButtonElement>(dialog, "sweep-select").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => void (async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        status.textContent = `Reading local pilot ${file.name}…`;
        candidates = await registry.read(file, controller.signal);
        select.innerHTML = candidates.map((sweep, index) => `<option value="${index}">${this.escape(sweep.name)}</option>`).join("");
        selectLabel.hidden = candidates.length < 2;
        status.textContent = `Loaded ${candidates.length} local pilot candidate${candidates.length === 1 ? "" : "s"}.`;
        updateSummary();
      } catch (error) {
        candidates = [];
        updateSummary();
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    })());
    select.addEventListener("change", updateSummary);
    cancel.addEventListener("click", () => {
      controller.abort();
      status.textContent = active ? "Cancellation requested. Partial output will be discarded." : "Cancelled.";
      run.disabled = true;
    });
    run.addEventListener("click", () => void this.run(dialog, selectedSweep, status, progress, run, cancel, controller, () => active, (value) => { active = value; }));
    dialog.addEventListener("close", () => { controller.abort(); dialog.remove(); });
  }

  private async run(dialog: HTMLDialogElement, selectedSweep: () => SweepSignal | undefined, status: HTMLElement, progress: HTMLProgressElement, run: HTMLButtonElement, cancel: HTMLButtonElement, controller: AbortController, isActive: () => boolean, setActive: (value: boolean) => void): Promise<void> {
    const sweep = selectedSweep();
    if (!sweep || isActive()) return;
    const firstInterval = (this.options.dataset.traceIndex.sampleIntervalsMicroseconds[0] ?? 0) / 1_000_000;
    if (!(firstInterval > 0) || Math.abs(firstInterval - sweep.sampleIntervalSeconds) > firstInterval * 1e-9) {
      status.textContent = `Sample interval mismatch: SEG-Y is ${(firstInterval * 1_000_000).toLocaleString()} µs; pilot is ${(sweep.sampleIntervalSeconds * 1_000_000).toLocaleString()} µs. Resample the pilot before FDSD.`;
      return;
    }
    let fdsd: FdSweepDeconvolutionOptions;
    try { fdsd = this.readOptions(dialog); } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); return; }
    setActive(true);
    run.disabled = true;
    const client = new FdsdWorkerClient();
    const sink = new BlobOutputSink("application/x-segy");
    try {
      status.textContent = "Preparing worker-backed FDSD…";
      await SegyWriter.write(this.options.dataset, sink, {
        sampleFormatCode: 5,
        processingHistory: [
          `FDSD pilot: ${sweep.name}`,
          `Pilot interval: ${(sweep.sampleIntervalSeconds * 1_000_000).toFixed(3)} microseconds`,
          `FDSD water level: ${(fdsd.waterLevelFraction * 100).toFixed(4)} percent of maximum pilot spectral power`,
          `FDSD passband: ${fdsd.lowCutHz ?? 0} Hz to ${fdsd.highCutHz ?? "Nyquist"} Hz; taper ${fdsd.taperHz ?? 0} Hz`
        ],
        signal: controller.signal,
        sampleProvider: async (traceId) => {
          const input = await this.options.dataset.traces.readBlock(Uint32Array.of(traceId), [], controller.signal);
          const output = await client.deconvolve(`fdsd-${traceId}`, sweep, fdsd, input, controller.signal);
          return output.samples;
        },
        onProgress: (completed, total) => {
          if (controller.signal.aborted) return;
          progress.value = total > 0 ? completed / total : 0;
          status.textContent = `FDSD and writing ${completed}/${total} traces…`;
        }
      });
      if (controller.signal.aborted) return;
      const outputName = outputNameFor(this.options.dataset.name);
      const blob = sink.toBlob();
      downloadBlob(blob, outputName);
      status.textContent = `Complete: ${Math.round(blob.size / 1024)} KiB downloaded locally. Opening FDSD SEG-Y…`;
      await this.options.onCorrelated(await SegyReader.open(new BlobSource(new File([blob], outputName))));
      cancel.disabled = true;
      status.textContent = "FDSD complete. The original and FDSD datasets are both available locally.";
    } catch (error) {
      status.textContent = controller.signal.aborted ? "Cancelled. Partial output was discarded and no FDSD dataset was opened." : error instanceof Error ? error.message : String(error);
      run.disabled = false;
    } finally {
      client.dispose();
      setActive(false);
    }
  }

  private readOptions(dialog: HTMLDialogElement): FdSweepDeconvolutionOptions {
    const waterLevelFraction = Number(this.byId<HTMLInputElement>(dialog, "fdsd-water-level").value) / 100;
    const optional = (id: string): number | undefined => {
      const value = this.byId<HTMLInputElement>(dialog, id).value.trim();
      if (value.length === 0) return undefined;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new RangeError(`${id.replace("fdsd-", "").replace(/-/g, " ")} must be numeric.`);
      return numeric;
    };
    const lowCutHz = optional("fdsd-low-cut");
    const highCutHz = optional("fdsd-high-cut");
    return {
      waterLevelFraction,
      removeTraceMean: true,
      removeSweepMean: true,
      sweepTaperFraction: 0,
      taperHz: optional("fdsd-taper") ?? 0,
      ...(lowCutHz === undefined ? {} : { lowCutHz }),
      ...(highCutHz === undefined ? {} : { highCutHz })
    };
  }

  private byId<T extends HTMLElement>(root: ParentNode, id: string): T { const value = root.querySelector<T>(`#${id}`); if (!value) throw new Error(`Missing FDSD dialog element #${id}.`); return value; }
  private escape(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }
}
