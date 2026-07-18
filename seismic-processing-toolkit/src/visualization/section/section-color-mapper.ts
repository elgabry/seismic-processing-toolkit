import type { PublicationSectionTrace, SectionNormalization } from "./section-render-model";

export interface SectionAmplitudeStatistics { readonly rms: number; readonly percentile: number; readonly nonFiniteSamples: number; readonly sampleCount: number; }

function finiteSample(value: number): number | undefined { return Number.isFinite(value) ? value : undefined; }

/** Two streaming passes over typed arrays: a bounded histogram avoids materializing and sorting all samples. */
export function sectionAmplitudeStatistics(traces: readonly PublicationSectionTrace[], percentile = 99, bins = 4096): SectionAmplitudeStatistics {
  let sumSquares = 0; let count = 0; let maximum = 0; let nonFiniteSamples = 0;
  for (const trace of traces) for (let index = 0; index < trace.samples.length; index += 1) { const value = finiteSample(trace.samples[index] ?? Number.NaN); if (value === undefined) { nonFiniteSamples += 1; continue; } const absolute = Math.abs(value); maximum = Math.max(maximum, absolute); sumSquares += value * value; count += 1; }
  if (count === 0 || maximum === 0) return { rms: 0, percentile: 0, nonFiniteSamples, sampleCount: count };
  const histogram = new Uint32Array(bins);
  for (const trace of traces) for (let index = 0; index < trace.samples.length; index += 1) { const value = finiteSample(trace.samples[index] ?? Number.NaN); if (value === undefined) continue; const bin = Math.min(bins - 1, Math.floor(Math.abs(value) / maximum * (bins - 1))); histogram[bin] = (histogram[bin] ?? 0) + 1; }
  const target = Math.max(0, Math.min(count - 1, Math.ceil(count * Math.max(0, Math.min(100, percentile)) / 100) - 1));
  let cumulative = 0; let percentileValue = maximum;
  for (let index = 0; index < histogram.length; index += 1) { cumulative += histogram[index] ?? 0; if (cumulative > target) { percentileValue = (index + 0.5) / bins * maximum; break; } }
  return { rms: Math.sqrt(sumSquares / count), percentile: percentileValue, nonFiniteSamples, sampleCount: count };
}

export function traceRms(samples: Float32Array): number {
  let sum = 0; let count = 0;
  for (let index = 0; index < samples.length; index += 1) { const value = samples[index] ?? Number.NaN; if (!Number.isFinite(value)) continue; sum += value * value; count += 1; }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

export function displayClipAmplitude(normalization: SectionNormalization, clipMode: "absolute" | "rms-multiple" | "percentile", clipValue: number, statistics: SectionAmplitudeStatistics): number {
  const safeClip = Math.max(Number.EPSILON, Math.abs(clipValue));
  if (normalization === "global-rms" || clipMode === "rms-multiple") return Math.max(Number.EPSILON, statistics.rms * safeClip);
  if (normalization === "global-percentile" || clipMode === "percentile") return Math.max(Number.EPSILON, statistics.percentile * (clipMode === "percentile" ? 1 : safeClip));
  return safeClip;
}

/** Positive samples become black in the publication default. Invalid values deliberately retain the neutral gray. */
export function amplitudeToGray(amplitude: number, clipAmplitude: number, options: { readonly polarity: "positive-black" | "positive-white"; readonly gamma: number; readonly zeroAmplitudeGray: number; }): number {
  const zero = Math.max(96, Math.min(160, Math.round(options.zeroAmplitudeGray)));
  if (!Number.isFinite(amplitude) || !Number.isFinite(clipAmplitude) || clipAmplitude <= 0) return zero;
  const normalized = Math.max(-1, Math.min(1, amplitude / clipAmplitude));
  const gamma = Math.max(Number.EPSILON, options.gamma);
  const shaped = Math.sign(normalized) * Math.pow(Math.abs(normalized), gamma) * (options.polarity === "positive-black" ? 1 : -1);
  const gray = shaped >= 0 ? zero * (1 - shaped) : zero + (255 - zero) * -shaped;
  return Math.max(0, Math.min(255, Math.round(gray)));
}
