import type { PngContext } from "../../export/png/png-export-service";
import { automaticTickInterval, sectionCoordinateToPixel, sectionTimeToPixel, tickValues, type SectionLayout } from "./section-layout";
import { sectionTraceCoordinate, type PublicationSectionModel } from "./section-render-model";

function label(value: number): string { return Number.isInteger(value) ? String(value) : value.toPrecision(4).replace(/0+$/, "").replace(/\.$/, ""); }

/** Page furniture is isolated from density raster generation so the frame always follows raster bounds. */
export class SectionAxisRenderer {
  public static draw(context: PngContext, model: PublicationSectionModel, layout: SectionLayout): void {
    const options = model.options; const { plot } = layout; context.save(); context.font = `${options.titleFontSize}px ${options.fontFamily}`; context.fillStyle = "#000"; context.textAlign = "center";
    if (options.titleLine1) context.fillText(options.titleLine1, plot.x + plot.width / 2, layout.titleFirstBaseline);
    if (options.titleLine2) context.fillText(options.titleLine2, plot.x + plot.width / 2, layout.titleSecondBaseline);
    context.strokeStyle = "#000"; context.fillStyle = "#000"; context.lineWidth = 1;
    if (options.showFrame) context.strokeRect(Math.round(plot.x) + 0.5, Math.round(plot.y) + 0.5, Math.round(plot.width), Math.round(plot.height));
    if (options.showYAxis) this.drawYAxis(context, model, layout);
    if (options.showXAxis) this.drawXAxis(context, model, layout);
    context.restore();
  }

  private static drawYAxis(context: PngContext, model: PublicationSectionModel, layout: SectionLayout): void {
    const options = model.options; const interval = options.yTickIntervalSeconds ?? automaticTickInterval(options.timeEndSeconds - options.timeStartSeconds); const ticks = tickValues(options.timeStartSeconds, options.timeEndSeconds, interval); const x = layout.plot.x; context.font = `${options.tickFontSize}px ${options.fontFamily}`; context.textAlign = "right"; context.textBaseline = "middle";
    for (const time of ticks) { const y = sectionTimeToPixel(time, options, layout); if (options.showYGrid) { context.strokeStyle = "rgba(0,0,0,0.18)"; context.beginPath(); context.moveTo(x, y); context.lineTo(x + layout.plot.width, y); context.stroke(); } context.strokeStyle = "#000"; context.beginPath(); context.moveTo(x - 5, y); context.lineTo(x, y); context.stroke(); if (options.showTimeLabels) context.fillText(label(time), x - 8, y); }
    if (options.yAxisLabel) { context.save(); context.translate(layout.yLabelX, layout.yLabelY); context.rotate(-Math.PI / 2); context.font = `${options.axisFontSize}px ${options.fontFamily}`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(options.yAxisLabel, 0, 0); context.restore(); }
  }

  private static drawXAxis(context: PngContext, model: PublicationSectionModel, layout: SectionLayout): void {
    const options = model.options; const traces = options.reverseTraceOrder ? [...model.traces].reverse() : model.traces; if (traces.length === 0) return; const values = traces.map((trace, index) => sectionTraceCoordinate(trace, index, options)); const minimum = Math.min(...values); const maximum = Math.max(...values); const interval = options.xTickInterval ?? automaticTickInterval(maximum - minimum); const ticks = tickValues(minimum, maximum, interval); const y = layout.plot.y + layout.plot.height; context.font = `${options.tickFontSize}px ${options.fontFamily}`; context.textAlign = "center"; context.textBaseline = "top";
    for (const value of ticks) { const x = sectionCoordinateToPixel(value, minimum, maximum, layout); if (options.showXGrid) { context.strokeStyle = "rgba(0,0,0,0.18)"; context.beginPath(); context.moveTo(x, layout.plot.y); context.lineTo(x, y); context.stroke(); } context.strokeStyle = "#000"; context.beginPath(); context.moveTo(x, y); context.lineTo(x, y + 5); context.stroke(); context.fillStyle = "#000"; context.fillText(label(value), x, y + 8); }
    context.font = `${options.axisFontSize}px ${options.fontFamily}`; context.fillText(options.xAxisLabel, layout.plot.x + layout.plot.width / 2, layout.xLabelBaseline - options.axisFontSize);
  }
}
