import type { SegyDataset } from "../io/segy/segy-dataset";

export interface WiggleView {
  readonly firstTrace: number;
  readonly traceCount: number;
  readonly timeStartSeconds: number;
  readonly timeEndSeconds: number;
  readonly mode: "wiggle" | "variable-area" | "density";
  readonly gain: number;
  readonly clip: number;
}

interface PlotMargin { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; }

/** Canvas-only renderer; seismic time increases downward, with zero at the top of a fitted view. */
export class WiggleRenderer {
  public constructor(private readonly canvas: HTMLCanvasElement) {}

  public async render(dataset: SegyDataset, view: WiggleView, selectedTrace?: number): Promise<void> {
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    this.canvas.dataset.timeDirection = "zero-top";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#050a0e";
    context.fillRect(0, 0, width, height);

    const margin: PlotMargin = { left: 62, top: 26, right: 12, bottom: 42 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const ids = Array.from({ length: Math.min(view.traceCount, dataset.traceCount - view.firstTrace) }, (_, index) => view.firstTrace + index).filter((value) => value >= 0);
    if (ids.length === 0 || plotWidth <= 0 || plotHeight <= 0) return;

    const dt = (dataset.traceIndex.sampleIntervalsMicroseconds[ids[0] ?? 0] ?? 1000) / 1_000_000;
    const span = Math.max(dt, view.timeEndSeconds - view.timeStartSeconds);
    const spacing = plotWidth / ids.length;
    context.strokeStyle = "rgba(87, 180, 211, 0.14)";
    context.strokeRect(margin.left, margin.top, plotWidth, plotHeight);
    if (view.mode !== "density") this.drawTraceBaselines(context, margin, plotHeight, ids.length, spacing);

    const samples = await Promise.all(ids.map((id) => dataset.traces.readTrace(id)));
    const sectionPeak = this.robustSectionPeak(samples, view, dt);
    const horizontalScale = spacing * 0.45 / Math.max(view.clip, Number.EPSILON);
    for (let column = 0; column < ids.length; column += 1) {
      const trace = samples[column] ?? new Float32Array(0);
      const x0 = margin.left + (column + 0.5) * spacing;
      const sampleStart = Math.max(0, Math.floor(view.timeStartSeconds / dt));
      const sampleEnd = Math.min(trace.length - 1, Math.ceil(view.timeEndSeconds / dt));
      if (view.mode === "density") {
        this.drawDensityTrace(context, trace, x0, spacing, margin, plotHeight, view, dt, span, sectionPeak);
        continue;
      }
      context.beginPath();
      for (let index = sampleStart; index <= sampleEnd; index += 1) {
        const y = margin.top + ((index * dt - view.timeStartSeconds) / span) * plotHeight;
        const amplitude = Math.max(-view.clip, Math.min(view.clip, (trace[index] ?? 0) / sectionPeak * view.gain));
        const x = x0 + amplitude * horizontalScale;
        if (index === sampleStart) context.moveTo(x, y); else context.lineTo(x, y);
      }
      if (view.mode === "variable-area") {
        context.lineTo(x0, margin.top + ((sampleEnd * dt - view.timeStartSeconds) / span) * plotHeight);
        context.closePath();
        context.fillStyle = ids[column] === selectedTrace ? "#50e3a4" : "#c3dde9";
        context.fill();
      } else {
        context.strokeStyle = ids[column] === selectedTrace ? "#50e3a4" : "#9ad6ef";
        context.lineWidth = 0.8;
        context.stroke();
      }
    }
    this.drawAxes(context, margin, plotWidth, plotHeight, ids, view.timeStartSeconds, span, spacing);
  }

  private drawTraceBaselines(context: CanvasRenderingContext2D, margin: PlotMargin, plotHeight: number, traceCount: number, spacing: number): void {
    context.beginPath();
    for (let column = 0; column < traceCount; column += 1) {
      const x = margin.left + (column + 0.5) * spacing;
      context.moveTo(x, margin.top);
      context.lineTo(x, margin.top + plotHeight);
    }
    context.strokeStyle = "rgba(104, 176, 201, 0.10)";
    context.lineWidth = 0.5;
    context.stroke();
  }

  /** Uses the visible section's 98th-percentile magnitude so a single FDSD spike cannot flatten every trace. */
  private robustSectionPeak(traces: readonly Float32Array[], view: WiggleView, dt: number): number {
    let sampleCount = 0;
    for (const trace of traces) sampleCount += Math.max(0, Math.min(trace.length - 1, Math.ceil(view.timeEndSeconds / dt)) - Math.max(0, Math.floor(view.timeStartSeconds / dt)) + 1);
    const stride = Math.max(1, Math.ceil(sampleCount / 100_000));
    const values = new Float32Array(Math.max(1, Math.ceil(sampleCount / stride)));
    let count = 0;
    for (const trace of traces) {
      const first = Math.max(0, Math.floor(view.timeStartSeconds / dt));
      const last = Math.min(trace.length - 1, Math.ceil(view.timeEndSeconds / dt));
      for (let index = first; index <= last; index += stride) {
        const value = trace[index] ?? 0;
        if (Number.isFinite(value) && count < values.length) values[count++] = Math.abs(value);
      }
    }
    if (count === 0) return 1;
    const sorted = values.subarray(0, count);
    sorted.sort();
    return Math.max(sorted[Math.min(count - 1, Math.floor((count - 1) * 0.98))] ?? 0, Number.EPSILON);
  }

  private drawDensityTrace(context: CanvasRenderingContext2D, trace: Float32Array, x0: number, spacing: number, margin: PlotMargin, plotHeight: number, view: WiggleView, dt: number, span: number, sectionPeak: number): void {
    const image = context.createImageData(Math.max(1, Math.floor(spacing)), Math.max(1, Math.floor(plotHeight)));
    for (let y = 0; y < image.height; y += 1) {
      const sample = Math.min(trace.length - 1, Math.max(0, Math.round((view.timeStartSeconds + y / image.height * span) / dt)));
      const normalized = Math.max(-1, Math.min(1, (trace[sample] ?? 0) / sectionPeak * view.gain / Math.max(view.clip, Number.EPSILON)));
      const value = Math.round(127.5 + normalized * 127.5);
      for (let x = 0; x < image.width; x += 1) {
        const offset = (y * image.width + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, Math.floor(x0 - spacing / 2), margin.top);
  }

  private drawAxes(context: CanvasRenderingContext2D, margin: PlotMargin, plotWidth: number, plotHeight: number, ids: readonly number[], timeStartSeconds: number, spanSeconds: number, spacing: number): void {
    const bottom = margin.top + plotHeight;
    context.save();
    context.font = "11px ui-monospace, monospace";
    context.lineWidth = 1;
    context.strokeStyle = "#6f9fb2";
    context.beginPath();
    context.moveTo(margin.left, margin.top);
    context.lineTo(margin.left, bottom);
    context.lineTo(margin.left + plotWidth, bottom);
    context.stroke();

    const tickCount = 6;
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let tick = 0; tick < tickCount; tick += 1) {
      const fraction = tick / (tickCount - 1);
      const y = margin.top + fraction * plotHeight;
      const time = timeStartSeconds + fraction * spanSeconds;
      context.beginPath();
      context.moveTo(margin.left - 5, y);
      context.lineTo(margin.left, y);
      context.stroke();
      context.strokeStyle = "rgba(87, 180, 211, 0.12)";
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(margin.left + plotWidth, y);
      context.stroke();
      context.strokeStyle = "#6f9fb2";
      context.fillStyle = "#b7d3df";
      context.fillText(this.timeLabel(time), margin.left - 8, y);
    }
    context.save();
    context.translate(16, margin.top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillStyle = "#90a9b7";
    context.fillText("TIME (ms)", 0, 0);
    context.restore();

    const visibleTickCount = Math.min(8, ids.length);
    context.textAlign = "center";
    context.textBaseline = "top";
    for (let tick = 0; tick < visibleTickCount; tick += 1) {
      const column = visibleTickCount === 1 ? 0 : Math.round(tick * (ids.length - 1) / (visibleTickCount - 1));
      const x = margin.left + (column + 0.5) * spacing;
      context.beginPath();
      context.moveTo(x, bottom);
      context.lineTo(x, bottom + 5);
      context.stroke();
      context.fillStyle = "#b7d3df";
      context.fillText(String((ids[column] ?? 0) + 1), x, bottom + 8);
    }
    context.fillStyle = "#90a9b7";
    context.fillText("TRACE NUMBER", margin.left + plotWidth / 2, bottom + 24);
    context.restore();
  }

  private timeLabel(timeSeconds: number): string {
    const milliseconds = timeSeconds * 1_000;
    const digits = Math.abs(milliseconds) < 10 ? 1 : 0;
    return milliseconds.toFixed(digits);
  }
}
