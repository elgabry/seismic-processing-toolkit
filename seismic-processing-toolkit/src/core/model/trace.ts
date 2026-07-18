/** A columnar header view intentionally avoids allocating a JavaScript object per trace. */
export interface TraceHeaderTableView {
  readonly fieldIds: readonly string[];
  readonly values: ReadonlyMap<string, Float64Array>;
}

/** A variable-length batch of trace samples. Sample offsets are in samples, not bytes. */
export interface TraceBlock {
  readonly traceIds: Uint32Array;
  readonly sampleOffsets: Uint32Array;
  readonly samples: Float32Array;
  readonly sampleIntervalSeconds: number;
  readonly headers: TraceHeaderTableView;
}

export function emptyTraceHeaders(): TraceHeaderTableView {
  return { fieldIds: [], values: new Map<string, Float64Array>() };
}
