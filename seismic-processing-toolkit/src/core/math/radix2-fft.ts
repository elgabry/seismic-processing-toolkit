/** In-place radix-2 complex FFT. Forward is unnormalised; inverse divides by N. */
export class Radix2Fft {
  private static readonly tables = new Map<number, { readonly cos: Float64Array; readonly sin: Float64Array }>();
  public static nextPowerOfTwo(value: number): number { let result = 1; while (result < value) result *= 2; return result; }
  public static transform(real: Float64Array, imaginary: Float64Array, inverse = false): void {
    const count = real.length;
    if (count !== imaginary.length || count === 0 || (count & (count - 1)) !== 0) throw new RangeError("FFT arrays must have equal power-of-two lengths.");
    const table = this.table(count);
    for (let index = 1, reversed = 0; index < count; index += 1) {
      let bit = count >>> 1; while ((reversed & bit) !== 0) { reversed ^= bit; bit >>>= 1; } reversed ^= bit;
      if (index < reversed) { const realValue = real[index] ?? 0; real[index] = real[reversed] ?? 0; real[reversed] = realValue; const imaginaryValue = imaginary[index] ?? 0; imaginary[index] = imaginary[reversed] ?? 0; imaginary[reversed] = imaginaryValue; }
    }
    for (let size = 2; size <= count; size *= 2) {
      const half = size >>> 1; const step = count / size;
      for (let start = 0; start < count; start += size) for (let index = 0; index < half; index += 1) {
        const twiddle = index * step; const cosine = table.cos[twiddle] ?? 0; const sine = (inverse ? 1 : -1) * (table.sin[twiddle] ?? 0);
        const even = start + index; const odd = even + half; const oddReal = real[odd] ?? 0; const oddImaginary = imaginary[odd] ?? 0;
        const transformedReal = oddReal * cosine - oddImaginary * sine; const transformedImaginary = oddReal * sine + oddImaginary * cosine;
        const evenReal = real[even] ?? 0; const evenImaginary = imaginary[even] ?? 0;
        real[even] = evenReal + transformedReal; imaginary[even] = evenImaginary + transformedImaginary;
        real[odd] = evenReal - transformedReal; imaginary[odd] = evenImaginary - transformedImaginary;
      }
    }
    if (inverse) for (let index = 0; index < count; index += 1) { real[index] = (real[index] ?? 0) / count; imaginary[index] = (imaginary[index] ?? 0) / count; }
  }
  private static table(count: number): { readonly cos: Float64Array; readonly sin: Float64Array } {
    const cached = this.tables.get(count); if (cached) return cached;
    if (this.tables.size >= 16) this.tables.clear();
    const cos = new Float64Array(count / 2); const sin = new Float64Array(count / 2);
    for (let index = 0; index < count / 2; index += 1) { cos[index] = Math.cos(2 * Math.PI * index / count); sin[index] = Math.sin(2 * Math.PI * index / count); }
    const created = { cos, sin }; this.tables.set(count, created); return created;
  }
}
