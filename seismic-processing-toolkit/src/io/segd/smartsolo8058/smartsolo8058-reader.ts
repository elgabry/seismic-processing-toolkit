import { SmartSoloFormatError } from "../../../core/errors/errors";
import type { RandomAccessSource } from "../../source/random-access-source";
import { SmartSolo8058Detector } from "./smartsolo8058-detector";
import { SmartSolo8058HeadersReader } from "./smartsolo8058-headers";
import { SmartSolo8058TraceAccessor } from "./smartsolo8058-trace-accessor";
import { SmartSolo8058TraceIndexBuilder } from "./smartsolo8058-trace-index";
import type { SmartSolo8058TraceIndex } from "./smartsolo8058-trace-index";
import type { Diagnostic } from "../../../core/errors/errors";
import type { SmartSolo8058Headers, SmartSoloDetectionResult, SmartSoloOpenOptions } from "./types";

/** Immutable SmartSolo 8058 acquisition metadata plus a bounded lazy trace accessor. */
export class SmartSolo8058Reader {
  public readonly traces: SmartSolo8058TraceAccessor;
  public readonly traceCount: number;

  private constructor(
    public readonly source: RandomAccessSource,
    public readonly detection: SmartSoloDetectionResult,
    public readonly headers: SmartSolo8058Headers,
    public readonly index: SmartSolo8058TraceIndex,
    public readonly diagnostics: readonly Diagnostic[]
  ) {
    this.traces = new SmartSolo8058TraceAccessor(source, index);
    this.traceCount = index.traceCount;
  }

  public static async open(source: RandomAccessSource, options: SmartSoloOpenOptions = {}): Promise<SmartSolo8058Reader> {
    const detection = await SmartSolo8058Detector.detect(source, options.signal);
    if (!detection.supported) throw new SmartSoloFormatError("The source is not a supported SmartSolo SEG-D 8058 variant.", detection.diagnostics[0] ?? { severity: "error", code: "SMARTSOLO_UNSUPPORTED", message: "The SmartSolo detector did not find a supported 8058 layout.", recoverable: false, fileName: source.name });
    const headers = await SmartSolo8058HeadersReader.read(source, options.signal);
    const indexed = await SmartSolo8058TraceIndexBuilder.build(source, headers, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      ...(options.indexWindowBytes === undefined ? {} : { windowBytes: options.indexWindowBytes })
    });
    return new SmartSolo8058Reader(source, detection, headers, indexed.index, [...detection.diagnostics, ...headers.diagnostics, ...indexed.diagnostics]);
  }
}
