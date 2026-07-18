import { downloadBlob } from "../../export/download";
import { BlobOutputSink } from "../../io/sink/output-sink";
import { SegyReader, SegyWriter, type SegyDataset } from "../../io/segy";
import { BlobSource } from "../../io/source/blob-source";
import { SweepReaderRegistry } from "../../io/sweep/sweep-reader-registry";
import type { SweepSignal } from "../../sweep/sweep-signal";
import { CorrelationWorkerClient } from "../../workers/correlation-worker-client";

export interface SweepCorrelationDialogOptions {
  readonly dataset: SegyDataset;
  readonly onCorrelated: (dataset: SegyDataset) => Promise<void>;
}

const correlationOptions = {
  output: "same" as const,
  algorithm: "auto" as const,
  removeTraceMean: true,
  removeSweepMean: true,
  sweepTaperFraction: 0,
  normalization: "sweep-energy" as const
};

function outputNameFor(name: string): string { return `${name.replace(/\.(sgy|segy)$/i, "")}_correlated.sgy`; }

/**
 * Browser workflow for the existing correlation engine. "Correlation" is used
 * deliberately: it is convolution with the time-reversed reference sweep.
 */
export class SweepCorrelationDialog {
  public constructor(private readonly options: SweepCorrelationDialogOptions) {}

  public open(): void {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form method="dialog" class="panel" aria-labelledby="sweep-correlation-title"><h2 id="sweep-correlation-title">Correlate SEG-Y with a sweep</h2><p class="meta">1. Choose a local pilot sweep. 2. Confirm its sample interval. 3. Run correlation. Correlation is convolution with the time-reversed sweep.</p><input id="sweep-file" data-testid="sweep-file-input" type="file" accept=".csv,.txt,.dat,.wav,.sgy,.segy,.tar" hidden><p><button id="sweep-select" data-testid="select-sweep" type="button">Choose sweep file…</button></p><p class="meta">Supported local files: two-column time/amplitude CSV or text, WAV, SEG-Y auxiliary traces, and TAR archives containing those files. A one-column text file defaults to a 1 ms interval, so use two columns when the interval differs.</p><label id="sweep-choice-label" hidden>Sweep candidate <select id="sweep-choice"></select></label><pre id="sweep-summary" class="meta">No sweep file selected.</pre><p id="sweep-status" role="status" aria-live="polite">The opened SEG-Y is unchanged until correlation completes.</p><progress id="sweep-progress" max="1" value="0"></progress><menu><button id="sweep-cancel" type="button">Cancel</button><button id="sweep-run" data-testid="run-sweep-correlation" type="button" disabled>Run correlation and download SEG-Y</button><button id="sweep-close" value="cancel">Close</button></menu></form>`;
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
      if (!sweep) { summary.textContent = "No sweep file selected."; run.disabled = true; return; }
      summary.textContent = `${sweep.name}\n${sweep.samples.length.toLocaleString()} samples · ${(sweep.sampleIntervalSeconds * 1_000_000).toLocaleString()} µs interval · ${sweep.units}\nSource: ${sweep.source}`;
      run.disabled = active;
    };
    this.byId<HTMLButtonElement>(dialog, "sweep-select").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => void (async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        status.textContent = `Reading local sweep ${file.name}…`;
        candidates = await registry.read(file, controller.signal);
        select.innerHTML = candidates.map((sweep, index) => `<option value="${index}">${this.escape(sweep.name)}</option>`).join("");
        selectLabel.hidden = candidates.length < 2;
        status.textContent = `Loaded ${candidates.length} local sweep candidate${candidates.length === 1 ? "" : "s"}.`;
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
    run.addEventListener("click", () => void this.run(selectedSweep, status, progress, run, cancel, controller, () => active, (value) => { active = value; }));
    dialog.addEventListener("close", () => { controller.abort(); dialog.remove(); });
  }

  private async run(selectedSweep: () => SweepSignal | undefined, status: HTMLElement, progress: HTMLProgressElement, run: HTMLButtonElement, cancel: HTMLButtonElement, controller: AbortController, isActive: () => boolean, setActive: (value: boolean) => void): Promise<void> {
    const sweep = selectedSweep();
    if (!sweep || isActive()) return;
    const firstInterval = (this.options.dataset.traceIndex.sampleIntervalsMicroseconds[0] ?? 0) / 1_000_000;
    if (!(firstInterval > 0) || Math.abs(firstInterval - sweep.sampleIntervalSeconds) > firstInterval * 1e-9) {
      status.textContent = `Sample interval mismatch: SEG-Y is ${(firstInterval * 1_000_000).toLocaleString()} µs; sweep is ${(sweep.sampleIntervalSeconds * 1_000_000).toLocaleString()} µs. Resample the sweep before correlation.`;
      return;
    }
    setActive(true);
    run.disabled = true;
    const client = new CorrelationWorkerClient();
    const sink = new BlobOutputSink("application/x-segy");
    try {
      status.textContent = "Preparing worker-backed correlation…";
      await SegyWriter.write(this.options.dataset, sink, {
        sampleFormatCode: 5,
        processingHistory: [`Sweep correlation: ${sweep.name}`, `Sweep interval: ${(sweep.sampleIntervalSeconds * 1_000_000).toFixed(3)} microseconds`, "Correlation uses the time-reversed pilot sweep."],
        signal: controller.signal,
        sampleProvider: async (traceId) => {
          const input = await this.options.dataset.traces.readBlock(Uint32Array.of(traceId), [], controller.signal);
          const output = await client.correlate(`sweep-correlation-${traceId}`, sweep, correlationOptions, input, controller.signal);
          return output.samples;
        },
        onProgress: (completed, total) => {
          if (controller.signal.aborted) return;
          progress.value = total > 0 ? completed / total : 0;
          status.textContent = `Correlating and writing ${completed}/${total} traces…`;
        }
      });
      if (controller.signal.aborted) return;
      const outputName = outputNameFor(this.options.dataset.name);
      const blob = sink.toBlob();
      downloadBlob(blob, outputName);
      status.textContent = `Complete: ${Math.round(blob.size / 1024)} KiB downloaded locally. Opening correlated SEG-Y…`;
      await this.options.onCorrelated(await SegyReader.open(new BlobSource(new File([blob], outputName))));
      cancel.disabled = true;
      status.textContent = "Correlation complete. The original and correlated datasets are both available locally.";
    } catch (error) {
      status.textContent = controller.signal.aborted ? "Cancelled. Partial output was discarded and no correlated dataset was opened." : error instanceof Error ? error.message : String(error);
      run.disabled = false;
    } finally {
      client.dispose();
      setActive(false);
    }
  }

  private byId<T extends HTMLElement>(root: ParentNode, id: string): T { const value = root.querySelector<T>(`#${id}`); if (!value) throw new Error(`Missing sweep correlation dialog element #${id}.`); return value; }
  private escape(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }
}
