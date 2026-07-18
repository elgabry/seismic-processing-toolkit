import type { PublicationSectionOptions } from "./section-render-model";

export interface SectionRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface SectionLayout { readonly plot: SectionRect; readonly titleFirstBaseline: number; readonly titleSecondBaseline: number; readonly xLabelBaseline: number; readonly yLabelX: number; readonly yLabelY: number; }

/** Keep the figure as a white page with a generous portrait margin, independent of the live viewport. */
export function publicationSectionLayout(options: PublicationSectionOptions): SectionLayout {
  const left = Math.round(options.width * 0.1);
  const right = Math.round(options.width * 0.04);
  const top = Math.round(options.height * 0.06);
  const bottom = Math.round(options.height * 0.06);
  const titleRoom = Math.max(options.titleFontSize * 2.5, 54);
  const axisRoom = options.showXAxis ? Math.max(options.axisFontSize + options.tickFontSize * 2.2, 54) : 12;
  const yAxisRoom = options.showYAxis ? Math.max(options.axisFontSize + options.tickFontSize * 2.2, 54) : 0;
  const plotX = Math.min(options.width - 2, left + yAxisRoom);
  const plotY = Math.min(options.height - 2, top + titleRoom);
  const plotWidth = Math.max(1, options.width - plotX - right);
  const plotHeight = Math.max(1, options.height - plotY - bottom - axisRoom);
  return {
    plot: { x: plotX, y: plotY, width: plotWidth, height: plotHeight },
    titleFirstBaseline: top + options.titleFontSize,
    titleSecondBaseline: top + options.titleFontSize * 2.15,
    xLabelBaseline: plotY + plotHeight + options.tickFontSize * 2.4 + options.axisFontSize,
    yLabelX: Math.max(options.axisFontSize, left * 0.35),
    yLabelY: plotY + plotHeight / 2
  };
}

export function sectionTimeToPixel(timeSeconds: number, options: PublicationSectionOptions, layout: SectionLayout): number {
  const span = Math.max(Number.EPSILON, options.timeEndSeconds - options.timeStartSeconds);
  return layout.plot.y + (timeSeconds - options.timeStartSeconds) / span * layout.plot.height;
}

export function sectionPixelToTime(pixelY: number, options: PublicationSectionOptions, layout: SectionLayout): number {
  return options.timeStartSeconds + (pixelY - layout.plot.y) / Math.max(1, layout.plot.height) * (options.timeEndSeconds - options.timeStartSeconds);
}

export function sectionCoordinateToPixel(value: number, minimum: number, maximum: number, layout: SectionLayout): number {
  return layout.plot.x + (value - minimum) / Math.max(Number.EPSILON, maximum - minimum) * layout.plot.width;
}

/** A readable 1/2/5 tick sequence. */
export function automaticTickInterval(range: number, targetTicks = 6): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const raw = range / Math.max(1, targetTicks);
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * power;
}

export function tickValues(start: number, end: number, interval: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(interval) || interval <= 0) return [];
  const first = Math.ceil(start / interval - 1e-9) * interval;
  const values: number[] = [];
  for (let value = first; value <= end + interval * 1e-7 && values.length < 1000; value += interval) values.push(Number(value.toFixed(12)));
  return values;
}
