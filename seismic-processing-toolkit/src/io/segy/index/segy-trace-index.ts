/** Compact, transferable index for all traces without decoded sample storage. */
export class SegyTraceIndex {
  public readonly traceCount: number;
  public constructor(
    public readonly headerOffsets: Float64Array,
    public readonly sampleDataOffsets: Float64Array,
    public readonly sampleCounts: Uint32Array,
    public readonly headerExtensionBytes: Uint32Array,
    public readonly sampleIntervalsMicroseconds: Uint32Array,
    public readonly fieldRecordNumbers: Int32Array,
    public readonly traceNumbersWithinFieldRecord: Int32Array,
    public readonly cdpNumbers: Int32Array,
    public readonly offsets: Int32Array,
    public readonly traceIdentificationCodes: Int16Array,
    public readonly validityFlags: Uint8Array
  ) {
    this.traceCount = headerOffsets.length;
    const lengths = [sampleDataOffsets.length, sampleCounts.length, headerExtensionBytes.length, sampleIntervalsMicroseconds.length, fieldRecordNumbers.length, traceNumbersWithinFieldRecord.length, cdpNumbers.length, offsets.length, traceIdentificationCodes.length, validityFlags.length];
    if (lengths.some((length) => length !== this.traceCount)) throw new RangeError("All trace-index columns must have equal length.");
  }

  public isValid(traceId: number): boolean { return (this.validityFlags[traceId] ?? 0) === 1; }
}
