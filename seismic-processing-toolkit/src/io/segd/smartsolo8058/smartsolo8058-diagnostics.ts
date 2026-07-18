import type { Diagnostic } from "../../../core/errors/errors";

export function smartSoloDiagnostic(severity: Diagnostic["severity"], code: string, message: string, recoverable: boolean, fileName?: string, byteOffset?: number, traceIndex?: number): Diagnostic {
  return {
    severity,
    code,
    message,
    recoverable,
    ...(fileName === undefined ? {} : { fileName }),
    ...(byteOffset === undefined ? {} : { byteOffset }),
    ...(traceIndex === undefined ? {} : { traceIndex })
  };
}
