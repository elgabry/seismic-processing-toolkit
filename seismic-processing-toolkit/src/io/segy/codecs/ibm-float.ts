/** Decodes a raw IBM/360 hexadecimal 32-bit float to an IEEE JavaScript number. */
export function ibm32ToNumber(word: number): number {
  if ((word & 0x7fffffff) === 0) return 0;
  const sign = (word >>> 31) === 0 ? 1 : -1;
  const exponent = (word >>> 24) & 0x7f;
  const fraction = word & 0x00ffffff;
  return sign * fraction * Math.pow(16, exponent - 64) / 0x1000000;
}

/** Encodes finite IEEE values using base-16 normalization and round-to-nearest mantissa. */
export function numberToIbm32(value: number): number {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const sign = value < 0 ? 0x80000000 : 0;
  let magnitude = Math.abs(value);
  let exponent = 64;
  while (magnitude < 0.0625 && exponent > 0) { magnitude *= 16; exponent -= 1; }
  while (magnitude >= 1 && exponent < 127) { magnitude /= 16; exponent += 1; }
  if (exponent <= 0) return 0;
  if (exponent >= 127 && magnitude >= 1) return (sign | 0x7fffffff) >>> 0;
  let fraction = Math.round(magnitude * 0x1000000);
  if (fraction >= 0x1000000) {
    fraction = Math.round(fraction / 16);
    exponent += 1;
  }
  if (exponent > 127) return (sign | 0x7fffffff) >>> 0;
  return (sign | (exponent << 24) | (fraction & 0x00ffffff)) >>> 0;
}
