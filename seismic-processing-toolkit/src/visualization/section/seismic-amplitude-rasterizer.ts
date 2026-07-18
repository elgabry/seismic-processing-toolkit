import type { PngContext } from "../../export/png/png-export-service";
import { applyAgcInPlace } from "../../processing/gain/gain-processors";
import { displayClipAmplitude, sectionAmplitudeStatistics, traceRms, amplitudeToGray, type SectionAmplitudeStatistics } from "./section-color-mapper";
import { sectionPixelToTime, type SectionLayout } from "./section-layout";
import { sectionTraceCoordinate, type PublicationSectionModel, type PublicationSectionTrace } from "./section-render-model";

export interface SectionRasterResult { readonly clipAmplitude: number; readonly statistics: SectionAmplitudeStatistics; readonly nonFiniteSamples: number; }

function sampleAt(samples: Float32Array, samplePosition: number, interpolation: "nearest" | "linear" | "antialiased", sampleFootprint: number): number {
  if (samples.length === 0 || !Number.isFinite(samplePosition)) return Number.NaN;
  if (interpolation === "antialiased" && sampleFootprint > 1) {
    const start = Math.max(0, Math.floor(samplePosition - sampleFootprint / 2)); const end = Math.min(samples.length - 1, Math.ceil(samplePosition + sampleFootprint / 2)); let sum = 0; let count = 0;
    for (let index = start; index <= end; index += 1) { const value = samples[index] ?? Number.NaN; if (Number.isFinite(value)) { sum += value; count += 1; } }
    return count === 0 ? Number.NaN : sum / count;
  }
  const low = Math.floor(samplePosition); const high = Math.min(samples.length - 1, low + 1);
  if (low < 0 || low >= samples.length) return Number.NaN;
  const first = samples[low] ?? Number.NaN;
  if (interpolation === "nearest" || high === low) return first;
  const second = samples[high] ?? Number.NaN;
  return Number.isFinite(first) && Number.isFinite(second) ? first + (second - first) * (samplePosition - low) : Number.NaN;
}

function tracePairForPixel(x: number, coordinates: Float64Array): readonly [number, number, number] {
  if (coordinates.length <= 1) return [0, 0, 0];
  const firstCoordinate = coordinates[0] ?? 0; const lastCoordinate = coordinates[coordinates.length - 1] ?? firstCoordinate;
  const span = Math.max(Number.EPSILON, lastCoordinate - firstCoordinate);
  const value = firstCoordinate + x * span;
  let high = 1;
  while (high < coordinates.length - 1 && (coordinates[high] ?? 0) < value) high += 1;
  const low = Math.max(0, high - 1); const denominator = Math.max(Number.EPSILON, (coordinates[high] ?? 0) - (coordinates[low] ?? 0));
  return [low, high, Math.max(0, Math.min(1, (value - (coordinates[low] ?? 0)) / denominator))];
}

function rasterCoordinates(traces: readonly PublicationSectionTrace[], model: PublicationSectionModel): Float64Array {
  const values = new Float64Array(traces.length);
  let previous = 0;
  for (let index = 0; index < traces.length; index += 1) { const value = model.options.equallySpacedTraces ? index : sectionTraceCoordinate(traces[index]!, index, model.options); previous = Number.isFinite(value) && value > previous ? value : index === 0 ? 0 : previous + 1; values[index] = previous; }
  return values;
}

/** Rasterizes directly into an ImageData buffer. It owns no dataset data and uses no DOM nodes. */
export class SeismicAmplitudeRasterizer {
  public static draw(context: PngContext, model: PublicationSectionModel, layout: SectionLayout): SectionRasterResult {
    const options = model.options; const traces = options.reverseTraceOrder ? [...model.traces].reverse() : model.traces; const statistics = sectionAmplitudeStatistics(traces, options.clipMode === "percentile" ? options.clipValue : 99); const clipAmplitude = options.normalization === "agc" ? options.clipMode === "absolute" ? Math.max(Number.EPSILON, options.clipValue) : 2 : displayClipAmplitude(options.normalization, options.clipMode, options.clipValue, statistics); const rmsValues = options.normalization === "trace-rms" ? Float64Array.from(traces, (trace) => Math.max(traceRms(trace.samples), Number.EPSILON)) : undefined;
    const width = Math.max(1, Math.round(layout.plot.width)); const height = Math.max(1, Math.round(layout.plot.height)); const image = context.createImageData(width, height); const coordinates = rasterCoordinates(traces, model); const span = Math.max(Number.EPSILON, options.timeEndSeconds - options.timeStartSeconds); const footprint = span / height / Math.max(model.sampleIntervalSeconds, Number.EPSILON); let nonFiniteSamples = 0;
    const agcWindowSamples = Math.max(1, Math.round((options.agcWindowSeconds ?? 0.25) / Math.max(model.sampleIntervalSeconds, Number.EPSILON))); const agcCache = new Map<number, Float32Array>(); const displaySamples = (index: number): Float32Array => { const source = traces[index]?.samples ?? new Float32Array(0); if (options.normalization !== "agc") return source; const cached = agcCache.get(index); if (cached) return cached; const conditioned = source.slice(); applyAgcInPlace(conditioned, agcWindowSamples); agcCache.set(index, conditioned); if (agcCache.size > 4) agcCache.delete(agcCache.keys().next().value as number); return conditioned; };
    for (let x = 0; x < width; x += 1) {
      const [low, high, fraction] = traces.length === 0 ? [0, 0, 0] as const : tracePairForPixel(width === 1 ? 0 : x / (width - 1), coordinates); const firstSamples = displaySamples(low); const secondSamples = displaySamples(high);
      for (let y = 0; y < height; y += 1) {
        let amplitude = Number.NaN;
        if (traces.length > 0) {
          const time = sectionPixelToTime(layout.plot.y + y + 0.5, options, layout); const samplePosition = time / Math.max(model.sampleIntervalSeconds, Number.EPSILON); let first = sampleAt(firstSamples, samplePosition, options.verticalInterpolation, footprint); let second = sampleAt(secondSamples, samplePosition, options.verticalInterpolation, footprint);
          if (rmsValues) { first /= rmsValues[low] ?? 1; second /= rmsValues[high] ?? 1; }
          amplitude = options.horizontalInterpolation === "linear" && high !== low && Number.isFinite(first) && Number.isFinite(second) ? first + (second - first) * fraction : first;
        }
        if (!Number.isFinite(amplitude)) nonFiniteSamples += 1;
        const gray = amplitudeToGray(amplitude, clipAmplitude, options); const offset = (y * width + x) * 4; image.data[offset] = gray; image.data[offset + 1] = gray; image.data[offset + 2] = gray; image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, Math.round(layout.plot.x), Math.round(layout.plot.y));
    return { clipAmplitude, statistics, nonFiniteSamples };
  }
}
