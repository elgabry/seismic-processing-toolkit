export type SweepUnits = "unknown" | "counts" | "volts" | "force";
export type SweepSource = "auxiliary-trace" | "external-file" | "tar-entry" | "generated";

/** An immutable pilot/reference signal. DSP APIs use seconds for its time quantities. */
export interface SweepSignal {
  readonly id: string;
  readonly name: string;
  readonly samples: Float32Array;
  readonly sampleIntervalSeconds: number;
  readonly startTimeSeconds: number;
  readonly units: SweepUnits;
  readonly source: SweepSource;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}
