import type { SweepSignal } from "../../sweep/sweep-signal";

export interface SweepFileReader {
  readonly id: string;
  canRead(file: File): boolean;
  read(file: File, signal?: AbortSignal): Promise<readonly SweepSignal[]>;
}
