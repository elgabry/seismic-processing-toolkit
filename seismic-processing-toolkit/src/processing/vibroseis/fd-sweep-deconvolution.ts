import { Radix2Fft } from "../../core/math/radix2-fft";
import { emptyTraceHeaders, type TraceBlock } from "../../core/model/trace";
import type { SweepSignal } from "../../sweep/sweep-signal";

export interface FdSweepDeconvolutionOptions {
  /** Fraction of maximum pilot spectral power added to every spectral denominator. */
  readonly waterLevelFraction: number;
  readonly removeTraceMean: boolean;
  readonly removeSweepMean: boolean;
  readonly sweepTaperFraction: number;
  readonly lowCutHz?: number;
  readonly highCutHz?: number;
  readonly taperHz?: number;
}

export interface FdSweepDeconvolutionResult {
  readonly samples: Float32Array;
  readonly sampleIntervalSeconds: number;
  readonly nonFiniteInputCount: number;
  readonly fftLength: number;
}

interface Spectrum { readonly real: Float64Array; readonly imaginary: Float64Array; readonly maximumPower: number; }

const defaults = {
  waterLevelFraction: 0.01,
  removeTraceMean: true,
  removeSweepMean: true,
  sweepTaperFraction: 0,
  taperHz: 0
};

function prepared(samples: Float32Array, removeMean: boolean, taperFraction: number): { readonly samples: Float32Array; readonly nonFiniteCount: number } {
  let sum = 0;
  let count = 0;
  let nonFiniteCount = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] ?? 0;
    if (Number.isFinite(value)) { sum += value; count += 1; } else nonFiniteCount += 1;
  }
  const mean = removeMean && count > 0 ? sum / count : 0;
  const result = new Float32Array(samples.length);
  const taperLength = Math.floor(samples.length * Math.max(0, Math.min(0.5, taperFraction)));
  for (let index = 0; index < samples.length; index += 1) {
    let value = Number.isFinite(samples[index] ?? 0) ? (samples[index] ?? 0) - mean : 0;
    if (taperLength > 0) {
      if (index < taperLength) value *= 0.5 * (1 - Math.cos(Math.PI * index / taperLength));
      if (index >= samples.length - taperLength) value *= 0.5 * (1 - Math.cos(Math.PI * (samples.length - 1 - index) / taperLength));
    }
    result[index] = value;
  }
  return { samples: result, nonFiniteCount };
}

/**
 * Stabilized frequency-domain sweep deconvolution (FDSD).
 *
 * It estimates R(f) = X(f)S*(f) / (|S(f)|² + epsilon), rather than forming
 * the cross-correlation X(f)S*(f). The output keeps the input trace length
 * and starts at time zero; it does not create a Klauder wavelet.
 */
export class FdSweepDeconvolutionPlan {
  private readonly options: FdSweepDeconvolutionOptions;
  private readonly sweep: Float32Array;
  private readonly spectra = new Map<number, Spectrum>();
  private readonly scratch = new Map<number, { readonly real: Float64Array; readonly imaginary: Float64Array }>();
  private disposed = false;

  private constructor(private readonly sourceSweep: SweepSignal, options: Partial<FdSweepDeconvolutionOptions>) {
    this.options = { ...defaults, ...options };
    this.validateOptions();
    this.sweep = prepared(sourceSweep.samples, this.options.removeSweepMean, this.options.sweepTaperFraction).samples;
  }

  public static create(sweep: SweepSignal, options: Partial<FdSweepDeconvolutionOptions> = {}): FdSweepDeconvolutionPlan {
    if (!(sweep.sampleIntervalSeconds > 0) || sweep.samples.length === 0) throw new RangeError("FDSD requires a non-empty sweep with a positive sample interval.");
    return new FdSweepDeconvolutionPlan(sweep, options);
  }

  public deconvolveTrace(trace: Float32Array, sampleIntervalSeconds: number, destination?: Float32Array): FdSweepDeconvolutionResult {
    if (this.disposed) throw new Error("FDSD plan has been disposed.");
    if (Math.abs(sampleIntervalSeconds - this.sourceSweep.sampleIntervalSeconds) > sampleIntervalSeconds * 1e-9) throw new RangeError("FDSD requires matching trace and sweep sample intervals; resample first.");
    const input = prepared(trace, this.options.removeTraceMean, 0);
    const fftLength = Radix2Fft.nextPowerOfTwo(Math.max(1, input.samples.length + this.sweep.length - 1));
    const scratch = this.scratchFor(fftLength);
    scratch.real.fill(0);
    scratch.imaginary.fill(0);
    for (let index = 0; index < input.samples.length; index += 1) scratch.real[index] = input.samples[index] ?? 0;
    Radix2Fft.transform(scratch.real, scratch.imaginary);
    const sweep = this.spectrumFor(fftLength);
    const floor = sweep.maximumPower * this.options.waterLevelFraction;
    for (let bin = 0; bin < fftLength; bin += 1) {
      const traceReal = scratch.real[bin] ?? 0;
      const traceImaginary = scratch.imaginary[bin] ?? 0;
      const sweepReal = sweep.real[bin] ?? 0;
      const sweepImaginary = sweep.imaginary[bin] ?? 0;
      const denominator = sweepReal * sweepReal + sweepImaginary * sweepImaginary + floor;
      const gain = this.passbandGain(this.frequencyForBin(bin, fftLength, sampleIntervalSeconds), sampleIntervalSeconds);
      scratch.real[bin] = gain * (traceReal * sweepReal + traceImaginary * sweepImaginary) / denominator;
      scratch.imaginary[bin] = gain * (traceImaginary * sweepReal - traceReal * sweepImaginary) / denominator;
    }
    Radix2Fft.transform(scratch.real, scratch.imaginary, true);
    const output = destination?.length === trace.length ? destination : new Float32Array(trace.length);
    for (let index = 0; index < output.length; index += 1) {
      const value = scratch.real[index] ?? 0;
      output[index] = Number.isFinite(value) ? value : 0;
    }
    return { samples: output, sampleIntervalSeconds, nonFiniteInputCount: input.nonFiniteCount, fftLength };
  }

  public deconvolveBlock(block: TraceBlock, shouldCancel?: () => boolean): TraceBlock {
    const offsets = new Uint32Array(block.traceIds.length + 1);
    const traces: Float32Array[] = [];
    let total = 0;
    for (let row = 0; row < block.traceIds.length; row += 1) {
      if (shouldCancel?.()) throw new DOMException("FDSD cancelled", "AbortError");
      const start = block.sampleOffsets[row] ?? 0;
      const end = block.sampleOffsets[row + 1] ?? start;
      const result = this.deconvolveTrace(block.samples.subarray(start, end), block.sampleIntervalSeconds).samples;
      offsets[row] = total;
      total += result.length;
      if (total > 0xffffffff) throw new RangeError("FDSD TraceBlock exceeds Uint32 sample offsets; reduce the worker batch size.");
      traces.push(result);
    }
    offsets[traces.length] = total;
    const samples = new Float32Array(total);
    for (let row = 0; row < traces.length; row += 1) samples.set(traces[row] ?? new Float32Array(0), offsets[row] ?? 0);
    return { traceIds: block.traceIds.slice(), sampleOffsets: offsets, samples, sampleIntervalSeconds: block.sampleIntervalSeconds, headers: block.headers ?? emptyTraceHeaders() };
  }

  public dispose(): void { this.spectra.clear(); this.scratch.clear(); this.disposed = true; }

  private validateOptions(): void {
    if (!(this.options.waterLevelFraction > 0) || this.options.waterLevelFraction > 1) throw new RangeError("FDSD water level must be greater than zero and no more than one.");
    if (!(this.options.sweepTaperFraction >= 0 && this.options.sweepTaperFraction <= 0.5)) throw new RangeError("FDSD sweep taper fraction must be within 0..0.5.");
    const nyquist = 1 / (2 * this.sourceSweep.sampleIntervalSeconds);
    const low = this.options.lowCutHz ?? 0;
    const high = this.options.highCutHz ?? nyquist;
    if (!(low >= 0) || !(high > low) || high > nyquist) throw new RangeError(`FDSD passband must lie within 0..${nyquist} Hz.`);
    const taper = this.options.taperHz ?? 0;
    if (!(taper >= 0)) throw new RangeError("FDSD passband taper must be non-negative.");
  }

  private scratchFor(count: number): { readonly real: Float64Array; readonly imaginary: Float64Array } {
    const cached = this.scratch.get(count);
    if (cached) return cached;
    if (this.scratch.size >= 4) this.scratch.clear();
    const created = { real: new Float64Array(count), imaginary: new Float64Array(count) };
    this.scratch.set(count, created);
    return created;
  }

  private spectrumFor(count: number): Spectrum {
    const cached = this.spectra.get(count);
    if (cached) return cached;
    const real = new Float64Array(count);
    const imaginary = new Float64Array(count);
    for (let index = 0; index < this.sweep.length; index += 1) real[index] = this.sweep[index] ?? 0;
    Radix2Fft.transform(real, imaginary);
    let maximumPower = 0;
    for (let index = 0; index < count; index += 1) maximumPower = Math.max(maximumPower, (real[index] ?? 0) ** 2 + (imaginary[index] ?? 0) ** 2);
    if (!(maximumPower > Number.EPSILON)) throw new RangeError("FDSD cannot invert a zero-energy sweep.");
    const created = { real, imaginary, maximumPower };
    this.spectra.set(count, created);
    return created;
  }

  private frequencyForBin(bin: number, count: number, sampleIntervalSeconds: number): number {
    const frequency = bin <= count / 2 ? bin / (count * sampleIntervalSeconds) : (count - bin) / (count * sampleIntervalSeconds);
    return Math.abs(frequency);
  }

  private passbandGain(frequency: number, sampleIntervalSeconds: number): number {
    const nyquist = 1 / (2 * sampleIntervalSeconds);
    const low = this.options.lowCutHz ?? 0;
    const high = this.options.highCutHz ?? nyquist;
    const taper = Math.min(this.options.taperHz ?? 0, (high - low) / 2);
    if (frequency < low || frequency > high) return 0;
    if (taper <= 0) return 1;
    if (low > 0 && frequency < low + taper) return 0.5 * (1 - Math.cos(Math.PI * (frequency - low) / taper));
    if (high < nyquist && frequency > high - taper) return 0.5 * (1 - Math.cos(Math.PI * (high - frequency) / taper));
    return 1;
  }
}
