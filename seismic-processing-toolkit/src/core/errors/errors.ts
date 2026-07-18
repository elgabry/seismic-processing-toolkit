/** Structured issue emitted by I/O and processing without relying on console output. */
export interface Diagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly fileName?: string;
  readonly byteOffset?: number;
  readonly traceIndex?: number;
  readonly field?: string;
  readonly recoverable: boolean;
}

export class SeismicError extends Error {
  public readonly diagnostic: Diagnostic;

  public constructor(message: string, diagnostic: Diagnostic) {
    super(message);
    this.name = new.target.name;
    this.diagnostic = diagnostic;
  }
}

export class SegyFormatError extends SeismicError {}
export class SegyTruncationError extends SeismicError {}
export class UnsupportedSampleFormatError extends SeismicError {}
export class HeaderValueError extends SeismicError {}
export class SweepFormatError extends SeismicError {}
export class ProcessingValidationError extends SeismicError {}
export class ProcessingCancelledError extends SeismicError {}
export class WorkerExecutionError extends SeismicError {}

export function throwIfAborted(signal: AbortSignal | undefined, context = "Operation"): void {
  if (signal?.aborted) {
    throw new ProcessingCancelledError(`${context} was cancelled.`, {
      severity: "warning",
      code: "PROCESSING_CANCELLED",
      message: `${context} was cancelled.`,
      recoverable: true
    });
  }
}
