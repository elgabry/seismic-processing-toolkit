/** SEG-Y coordinate/elevation scalar policy: + multiply, - divide, 0 identity. */
export class HeaderScalars {
  public static apply(raw: number, scalar: number): number { return scalar > 0 ? raw * scalar : scalar < 0 ? raw / Math.abs(scalar) : raw; }
  public static encode(scaled: number, scalar: number): number { const raw = scalar > 0 ? scaled / scalar : scalar < 0 ? scaled * Math.abs(scalar) : scaled; if (!Number.isSafeInteger(Math.round(raw))) throw new RangeError("Scaled header value cannot be represented as an integer raw SEG-Y value."); return Math.round(raw); }
}
