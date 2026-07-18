import type { PngContext } from "../../export/png/png-export-service";
import { SectionAxisRenderer } from "./section-axis-renderer";
import { publicationSectionLayout, type SectionLayout } from "./section-layout";
import type { PublicationSectionModel } from "./section-render-model";
import { SeismicAmplitudeRasterizer, type SectionRasterResult } from "./seismic-amplitude-rasterizer";

export interface PublicationSectionRenderResult { readonly layout: SectionLayout; readonly raster: SectionRasterResult; }

/** Uses a fresh export canvas and immutable model; the interactive viewport is deliberately never read or changed. */
export class PublicationSectionRenderer {
  public static draw(context: PngContext, model: PublicationSectionModel): PublicationSectionRenderResult {
    const layout = publicationSectionLayout(model.options);
    const raster = SeismicAmplitudeRasterizer.draw(context, model, layout);
    if (model.options.wiggleOverlay) this.drawWiggles(context, model, layout, raster.clipAmplitude);
    SectionAxisRenderer.draw(context, model, layout);
    return { layout, raster };
  }

  private static drawWiggles(context: PngContext, model: PublicationSectionModel, layout: SectionLayout, clipAmplitude: number): void {
    const traces = model.options.reverseTraceOrder ? [...model.traces].reverse() : model.traces; if (traces.length === 0) return;
    const firstSample = Math.max(0, Math.floor(model.options.timeStartSeconds / model.sampleIntervalSeconds)); const lastTimeSample = Math.ceil(model.options.timeEndSeconds / model.sampleIntervalSeconds); const spacing = layout.plot.width / Math.max(1, traces.length);
    context.save(); context.strokeStyle = "#000"; context.globalAlpha = Math.max(0, Math.min(1, model.options.wiggleOpacity)); context.lineWidth = 0.6;
    for (let traceIndex = 0; traceIndex < traces.length; traceIndex += 1) { const trace = traces[traceIndex]!; const end = Math.min(trace.samples.length - 1, lastTimeSample); if (end < firstSample) continue; const x0 = layout.plot.x + (traceIndex + 0.5) * spacing; context.beginPath();
      for (let sample = firstSample; sample <= end; sample += 1) { const time = sample * model.sampleIntervalSeconds; const y = layout.plot.y + (time - model.options.timeStartSeconds) / Math.max(Number.EPSILON, model.options.timeEndSeconds - model.options.timeStartSeconds) * layout.plot.height; const normalized = Math.max(-1, Math.min(1, (trace.samples[sample] ?? 0) / Math.max(Number.EPSILON, clipAmplitude))); const x = x0 + normalized * spacing * 0.42; if (sample === firstSample) context.moveTo(x, y); else context.lineTo(x, y); }
      context.stroke(); }
    context.restore();
  }
}
