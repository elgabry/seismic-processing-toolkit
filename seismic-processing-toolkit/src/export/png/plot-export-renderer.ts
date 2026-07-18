import { PngExportService, type PngExportOptions } from "./png-export-service";

export interface PlotExportTrace { readonly traceId: number; readonly samples: Float32Array; }
export interface PlotPngOptions extends PngExportOptions { readonly traces: readonly PlotExportTrace[]; readonly sampleIntervalSeconds: number; readonly mode: "wiggle" | "variable-area" | "density"; readonly gain: number; readonly clip: number; readonly timeStartSeconds: number; readonly timeEndSeconds: number; readonly title?: string; }

/** Deterministic plot renderer used by PNG export; it receives immutable render state and never touches the live canvas. */
export class PlotExportRenderer {
  public static async export(options: PlotPngOptions): Promise<Blob> {
    return PngExportService.render((context, width, height) => {
      const margin = { left: 42, right: 12, top: 28, bottom: 18 }; const plotWidth = width - margin.left - margin.right; const plotHeight = height - margin.top - margin.bottom; const span = Math.max(options.sampleIntervalSeconds, options.timeEndSeconds - options.timeStartSeconds); const spacing = options.traces.length === 0 ? plotWidth : plotWidth / options.traces.length;
      context.strokeStyle = "#31424d"; context.strokeRect(margin.left, margin.top, plotWidth, plotHeight); context.fillStyle = "#b7c9d3"; context.font = "12px ui-monospace, monospace"; if (options.title) context.fillText(options.title, margin.left, 16);
      for (let column = 0; column < options.traces.length; column += 1) {
        const trace = options.traces[column]; if (!trace) continue; const first = Math.max(0, Math.floor(options.timeStartSeconds / options.sampleIntervalSeconds)); const last = Math.min(trace.samples.length - 1, Math.ceil(options.timeEndSeconds / options.sampleIntervalSeconds)); let peak = 0; for (let sample = first; sample <= last; sample += 1) peak = Math.max(peak, Math.abs(trace.samples[sample] ?? 0)); const x0 = margin.left + (column + 0.5) * spacing; const scale = peak === 0 ? 0 : spacing * 0.45 * options.gain / peak;
        if (options.mode === "density") { const columnWidth = Math.max(1, Math.floor(spacing)); const image = context.createImageData(columnWidth, Math.max(1, Math.floor(plotHeight))); for (let y = 0; y < image.height; y += 1) { const sample = Math.min(last, Math.max(first, Math.round((options.timeStartSeconds + y / image.height * span) / options.sampleIntervalSeconds))); const normalized = Math.max(-1, Math.min(1, (trace.samples[sample] ?? 0) / Math.max(peak, Number.EPSILON) * options.gain / options.clip)); const shade = Math.round(127.5 + normalized * 127.5); for (let x = 0; x < image.width; x += 1) { const offset = (y * image.width + x) * 4; image.data[offset] = shade; image.data[offset + 1] = shade; image.data[offset + 2] = shade; image.data[offset + 3] = 255; } } context.putImageData(image, Math.floor(x0 - columnWidth / 2), margin.top); continue; }
        context.beginPath(); for (let sample = first; sample <= last; sample += 1) { const y = margin.top + ((sample * options.sampleIntervalSeconds - options.timeStartSeconds) / span) * plotHeight; const amplitude = Math.max(-options.clip, Math.min(options.clip, (trace.samples[sample] ?? 0) / Math.max(peak, Number.EPSILON) * options.gain)); const x = x0 + amplitude * scale; if (sample === first) context.moveTo(x, y); else context.lineTo(x, y); } if (options.mode === "variable-area") { context.lineTo(x0, margin.top + ((last * options.sampleIntervalSeconds - options.timeStartSeconds) / span) * plotHeight); context.closePath(); context.fillStyle = "#c3dde9"; context.fill(); } else { context.strokeStyle = "#9ad6ef"; context.lineWidth = 1; context.stroke(); }
      }
    }, options);
  }
}
