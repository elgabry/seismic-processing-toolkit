import type { RandomAccessSource } from "../../source/random-access-source";
import { SmartSolo8058 } from "./smartsolo8058-constants";
import { smartSoloDiagnostic } from "./smartsolo8058-diagnostics";
import type { SmartSoloDetectionResult } from "./types";

/** Evidence-based detector for the exact SmartSolo 8058 layout used by the legacy converter. */
export class SmartSolo8058Detector {
  public static async detect(source: RandomAccessSource, signal?: AbortSignal): Promise<SmartSoloDetectionResult> {
    const reasons: string[] = [];
    const diagnostics = [];
    if (source.size < 4) {
      diagnostics.push(smartSoloDiagnostic("error", "SMARTSOLO_SHORT_SIGNATURE", "The source is shorter than the four-byte SEG-D signature.", false, source.name, 0));
      return { confidence: 0, supported: false, reasons, diagnostics };
    }
    const prefix = new Uint8Array(await source.read(0, Math.min(source.size, 96), signal));
    const formatMatches = prefix[SmartSolo8058.formatCodeOffset] === SmartSolo8058.formatCodeHigh && prefix[SmartSolo8058.formatCodeOffset + 1] === SmartSolo8058.formatCodeLow;
    if (!formatMatches) {
      reasons.push("Bytes 2–3 are not the SmartSolo format-8058 signature 0x8058.");
      diagnostics.push(smartSoloDiagnostic("info", "SMARTSOLO_SIGNATURE_MISMATCH", "The SEG-D format-8058 signature was not present; the file was not classified as SmartSolo 8058.", true, source.name, SmartSolo8058.formatCodeOffset));
      return { confidence: 0, supported: false, formatCode: ((prefix[2] ?? 0) << 8) | (prefix[3] ?? 0), reasons, diagnostics };
    }
    reasons.push("Bytes 2–3 match the legacy SmartSolo 8058 signature.");
    const additional = (prefix[SmartSolo8058.additionalGeneralHeadersOffset] ?? 0) >>> 4;
    let revision: string | undefined;
    if (additional >= 1 && prefix.length >= SmartSolo8058.generalHeaderTwoOffset + 12) {
      revision = `${prefix[SmartSolo8058.generalHeaderTwoOffset + SmartSolo8058.revisionMajorOffset] ?? 0}.${prefix[SmartSolo8058.generalHeaderTwoOffset + SmartSolo8058.revisionMinorOffset] ?? 0}`;
      if (revision === "1.0" || revision === "2.1") reasons.push(`General header 2 declares supported revision ${revision}.`);
      else {
        reasons.push(`General header 2 declares unsupported revision ${revision}.`);
        diagnostics.push(smartSoloDiagnostic("error", "SMARTSOLO_UNSUPPORTED_REVISION", `SmartSolo format 8058 revision ${revision} is not among the verified 1.0/2.1 layouts.`, false, source.name, SmartSolo8058.generalHeaderTwoOffset + SmartSolo8058.revisionMajorOffset));
      }
    } else {
      revision = "1.0";
      reasons.push("No general header 2 is declared; using the legacy revision-1.0 layout.");
    }
    const supported = (revision === "1.0" || revision === "2.1") && source.size >= SmartSolo8058.traceHeaderBytes;
    if (source.size < SmartSolo8058.traceHeaderBytes) diagnostics.push(smartSoloDiagnostic("error", "SMARTSOLO_SHORT_FILE", "The source is shorter than one SmartSolo trace header.", false, source.name, source.size));
    return {
      confidence: supported ? 1 : 0.7,
      supported,
      formatCode: 8058,
      revision,
      reasons,
      diagnostics
    };
  }
}
