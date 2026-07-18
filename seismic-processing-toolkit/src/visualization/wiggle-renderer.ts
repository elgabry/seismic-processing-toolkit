import type { SegyDataset } from "../io/segy/segy-dataset";

export interface WiggleView { readonly firstTrace: number; readonly traceCount: number; readonly timeStartSeconds: number; readonly timeEndSeconds: number; readonly mode: "wiggle" | "variable-area" | "density"; readonly gain: number; readonly clip: number; }
/** Canvas-only renderer; transformations stay outside SEG-Y and DSP modules. */
export class WiggleRenderer {
  public constructor(private readonly canvas: HTMLCanvasElement) {}
  public async render(dataset: SegyDataset, view: WiggleView, selectedTrace?: number): Promise<void> {
    const context = this.canvas.getContext("2d"); if (!context) return;
    const width = this.canvas.clientWidth; const height = this.canvas.clientHeight; const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(width * ratio)); this.canvas.height = Math.max(1, Math.round(height * ratio)); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.fillStyle = "#050a0e"; context.fillRect(0, 0, width, height);
    const margin = { left: 52, top: 22, right: 12, bottom: 22 }; const plotWidth = width - margin.left - margin.right; const plotHeight = height - margin.top - margin.bottom;
    const ids = Array.from({ length: Math.min(view.traceCount, dataset.traceCount - view.firstTrace) }, (_, index) => view.firstTrace + index).filter((value) => value >= 0);
    if (ids.length === 0 || plotWidth <= 0 || plotHeight <= 0) return;
    const dt = (dataset.traceIndex.sampleIntervalsMicroseconds[ids[0] ?? 0] ?? 1000) / 1_000_000; const span = Math.max(dt, view.timeEndSeconds - view.timeStartSeconds); const spacing = plotWidth / ids.length;
    context.strokeStyle = "rgba(87, 180, 211, 0.14)"; context.strokeRect(margin.left, margin.top, plotWidth, plotHeight);
    const samples = await Promise.all(ids.map((id) => dataset.traces.readTrace(id)));
    for (let column = 0; column < ids.length; column += 1) {
      const trace = samples[column] ?? new Float32Array(0); const x0 = margin.left + (column + 0.5) * spacing; const sampleStart = Math.max(0, Math.floor(view.timeStartSeconds / dt)); const sampleEnd = Math.min(trace.length - 1, Math.ceil(view.timeEndSeconds / dt));
      let peak = 0; for (let index = sampleStart; index <= sampleEnd; index += 1) peak = Math.max(peak, Math.abs(trace[index] ?? 0)); const scale = peak > 0 ? (spacing * 0.45 * view.gain / peak) : 0;
      if (view.mode === "density") { const image = context.createImageData(Math.max(1, Math.floor(spacing)), Math.max(1, Math.floor(plotHeight))); for (let y = 0; y < image.height; y += 1) { const sample = Math.min(trace.length - 1, Math.max(0, Math.round((view.timeStartSeconds + y / image.height * span) / dt))); const normalized = Math.max(-1, Math.min(1, (trace[sample] ?? 0) / Math.max(peak, Number.EPSILON) * view.gain / view.clip)); const value = Math.round(127.5 + normalized * 127.5); for (let x = 0; x < image.width; x += 1) { const offset = (y * image.width + x) * 4; image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value; image.data[offset + 3] = 255; } } context.putImageData(image, Math.floor(x0 - spacing / 2), margin.top); continue; }
      context.beginPath(); for (let index = sampleStart; index <= sampleEnd; index += 1) { const y = margin.top + ((index * dt - view.timeStartSeconds) / span) * plotHeight; const amplitude = Math.max(-view.clip, Math.min(view.clip, (trace[index] ?? 0) / Math.max(peak, Number.EPSILON) * view.gain)); const x = x0 + amplitude * scale; if (index === sampleStart) context.moveTo(x, y); else context.lineTo(x, y); } if (view.mode === "variable-area") { context.lineTo(x0, margin.top + ((sampleEnd * dt - view.timeStartSeconds) / span) * plotHeight); context.closePath(); context.fillStyle = ids[column] === selectedTrace ? "#50e3a4" : "#c3dde9"; context.fill(); } else { context.strokeStyle = ids[column] === selectedTrace ? "#50e3a4" : "#9ad6ef"; context.lineWidth = 0.8; context.stroke(); }
    }
    context.fillStyle = "#90a9b7"; context.font = "11px ui-monospace, monospace"; context.fillText("TIME (s)", 4, margin.top + plotHeight / 2); context.fillText(`${view.timeStartSeconds.toFixed(3)}–${view.timeEndSeconds.toFixed(3)} s`, margin.left, 14);
  }
}
