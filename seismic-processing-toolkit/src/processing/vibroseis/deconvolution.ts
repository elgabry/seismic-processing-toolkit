import { convolve } from "./convolution";

export interface DeconvolutionParameters { readonly operatorLengthSamples: number; readonly predictionDistanceSamples: number; readonly designStartSample?: number; readonly designEndSampleExclusive?: number; readonly prewhiteningFraction: number; }
export interface DeconvolutionResult { readonly operator: Float32Array; readonly samples: Float32Array; }

function autocorrelation(samples: Float32Array, length: number): Float64Array { const result = new Float64Array(length); for (let lag = 0; lag < length; lag += 1) { let sum = 0; for (let index = 0; index + lag < samples.length; index += 1) sum += (samples[index] ?? 0) * (samples[index + lag] ?? 0); result[lag] = sum; } return result; }

/** Solves R a = rhs for a symmetric Toeplitz autocorrelation matrix using Cholesky factorisation. */
export function solveToeplitz(correlation: Float64Array, rhs: Float64Array): Float64Array {
  const order = rhs.length;
  if (order === 0 || correlation.length < order || !(correlation[0] ?? 0 > Number.EPSILON)) throw new RangeError("Autocorrelation is singular or too short for the requested operator.");
  const lower = new Float64Array(order * order);
  for (let row = 0; row < order; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = correlation[Math.abs(row - column)] ?? 0;
      for (let index = 0; index < column; index += 1) value -= (lower[row * order + index] ?? 0) * (lower[column * order + index] ?? 0);
      if (row === column) {
        if (!(value > Number.EPSILON) || !Number.isFinite(value)) throw new RangeError("Deconvolution Toeplitz system is unstable; increase prewhitening.");
        lower[row * order + column] = Math.sqrt(value);
      } else {
        const diagonal = lower[column * order + column] ?? 0;
        if (!(diagonal > Number.EPSILON)) throw new RangeError("Deconvolution Toeplitz system is singular.");
        lower[row * order + column] = value / diagonal;
      }
    }
  }
  const forward = new Float64Array(order);
  for (let row = 0; row < order; row += 1) {
    let value = rhs[row] ?? 0;
    for (let column = 0; column < row; column += 1) value -= (lower[row * order + column] ?? 0) * (forward[column] ?? 0);
    forward[row] = value / (lower[row * order + row] ?? 1);
  }
  const result = new Float64Array(order);
  for (let row = order - 1; row >= 0; row -= 1) {
    let value = forward[row] ?? 0;
    for (let column = row + 1; column < order; column += 1) value -= (lower[column * order + row] ?? 0) * (result[column] ?? 0);
    result[row] = value / (lower[row * order + row] ?? 1);
  }
  return result;
}
/** Levinson-Durbin solver for a positive-definite autocorrelation Toeplitz system. */
export function levinsonDurbin(correlation: Float64Array, order: number): Float64Array {
  if (order < 1 || correlation.length < order + 1 || !(correlation[0] ?? 0 > Number.EPSILON)) throw new RangeError("Autocorrelation is singular or too short for the requested operator.");
  const coefficients = new Float64Array(order + 1); coefficients[0] = 1; let error = correlation[0] ?? 0;
  for (let current = 1; current <= order; current += 1) { let sum = correlation[current] ?? 0; for (let index = 1; index < current; index += 1) sum += (coefficients[index] ?? 0) * (correlation[current - index] ?? 0); const reflection = -sum / error; if (!Number.isFinite(reflection) || Math.abs(reflection) >= 1) throw new RangeError("Deconvolution Toeplitz system is unstable; increase prewhitening."); const previous = coefficients.slice(); coefficients[current] = reflection; for (let index = 1; index < current; index += 1) coefficients[index] = (previous[index] ?? 0) + reflection * (previous[current - index] ?? 0); error *= 1 - reflection * reflection; if (error <= Number.EPSILON) throw new RangeError("Deconvolution prediction error is near zero; increase prewhitening."); }
  return coefficients;
}
/** Wiener spiking/predictive deconvolution. Distances are samples, converted at the UI boundary. */
export function deconvolve(trace: Float32Array, parameters: DeconvolutionParameters): DeconvolutionResult {
  if (!Number.isInteger(parameters.operatorLengthSamples) || parameters.operatorLengthSamples < 1 || parameters.operatorLengthSamples >= trace.length) throw new RangeError("Operator length must be an integer smaller than the trace length.");
  if (!Number.isInteger(parameters.predictionDistanceSamples) || parameters.predictionDistanceSamples < 0) throw new RangeError("Prediction distance must be a non-negative integer sample count.");
  if (!Number.isFinite(parameters.prewhiteningFraction) || parameters.prewhiteningFraction < 0) throw new RangeError("Prewhitening must be a non-negative finite fraction.");
  const start = parameters.designStartSample ?? 0; const end = parameters.designEndSampleExclusive ?? trace.length;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > trace.length || end - start <= parameters.operatorLengthSamples) throw new RangeError("Deconvolution design window is invalid.");
  const design = trace.subarray(start, end);
  const predictionLag = parameters.predictionDistanceSamples;
  const autocorrelationValues = autocorrelation(design, parameters.operatorLengthSamples + predictionLag + 1);
  const zeroLag = autocorrelationValues[0] ?? 0;
  autocorrelationValues[0] = zeroLag * (1 + parameters.prewhiteningFraction);

  let filter: Float32Array;
  if (predictionLag === 0) {
    const coefficients = levinsonDurbin(autocorrelationValues, parameters.operatorLengthSamples);
    filter = new Float32Array(parameters.operatorLengthSamples + 1);
    filter[0] = 1;
    for (let index = 1; index < filter.length; index += 1) filter[index] = coefficients[index] ?? 0;
  } else {
    const rhs = new Float64Array(parameters.operatorLengthSamples);
    for (let index = 0; index < rhs.length; index += 1) rhs[index] = -(autocorrelationValues[predictionLag + index] ?? 0);
    const coefficients = solveToeplitz(autocorrelationValues, rhs);
    filter = new Float32Array(predictionLag + parameters.operatorLengthSamples);
    filter[0] = 1;
    for (let index = 0; index < coefficients.length; index += 1) filter[predictionLag + index] = coefficients[index] ?? 0;
  }
  const full = convolve(trace, filter, "full");
  return { operator: filter, samples: full.slice(0, trace.length) };
}
