import type { Diagnostic } from "../../../core/errors/errors";

export type SmartSoloSampleEncoding = "ieee-float32-be" | "unsupported";
export type SmartSoloTraceClass = "unknown" | "data" | "auxiliary" | "pilot";

export interface SmartSoloDetectionResult {
  readonly confidence: number;
  readonly supported: boolean;
  readonly manufacturerCode?: number;
  readonly formatCode?: number;
  readonly revision?: string;
  readonly reasons: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface SmartSoloRawHeader {
  readonly type: "general" | "channel-set" | "extended" | "external";
  readonly byteOffset: number;
  readonly rawBytes: Uint8Array<ArrayBuffer>;
}

export interface SmartSolo8058Headers {
  readonly rawPrefix: Uint8Array<ArrayBuffer>;
  readonly rawHeaders: readonly SmartSoloRawHeader[];
  readonly additionalGeneralHeaderBlocks: number;
  readonly channelSetBlocks: number;
  readonly skewBlocks: number;
  readonly extendedHeaderBlocks: number;
  readonly externalHeaderBlocks: number;
  readonly dataOffset: number;
  readonly revision: "1.0" | "2.1";
  readonly gatherType: number;
  readonly sampleIntervalMicroseconds: number;
  readonly declaredTraceCount: number;
  readonly declaredSamplesPerTrace: number;
  readonly sourceType: number;
  readonly fieldRecordNumber: number;
  readonly sourceLine: number;
  readonly sourcePoint: number;
  readonly fileSourceEastingCentimetres: number;
  readonly fileSourceNorthingCentimetres: number;
  readonly fileSourceElevationCentimetres: number;
  readonly fileSourceLatitude: number;
  readonly fileSourceLongitude: number;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SmartSoloTraceMetadata {
  readonly traceId: number;
  readonly traceHeaderOffset: number;
  readonly sampleDataOffset: number;
  readonly sampleCount: number;
  readonly sampleIntervalMicroseconds: number;
  readonly sampleEncoding: SmartSoloSampleEncoding;
  readonly traceNumber: number;
  readonly fieldRecordNumber: number;
  readonly channelNumber: number;
  readonly receiverSerial: number;
  readonly receiverEastingCentimetres: number;
  readonly receiverNorthingCentimetres: number;
  readonly receiverElevationCentimetres: number;
  readonly sourceEastingCentimetres: number;
  readonly sourceNorthingCentimetres: number;
  readonly sourceElevationCentimetres: number;
  readonly receiverLatitude: number;
  readonly receiverLongitude: number;
  readonly traceClass: SmartSoloTraceClass;
  readonly valid: boolean;
}

export interface SmartSoloIndexProgress {
  readonly phase: "indexing";
  readonly bytesScanned: number;
  readonly totalBytes: number;
  readonly traceCount: number;
}

export interface SmartSoloOpenOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SmartSoloIndexProgress) => void;
  readonly indexWindowBytes?: number;
}

export interface SmartSoloConversionOptions {
  readonly outputRevision?: 0 | 1 | 2;
  readonly sampleFormatCode?: number;
  readonly outputEndianness?: "big" | "little";
  readonly textualEncoding?: "ascii" | "ebcdic";
  readonly includeAuxiliaryTraces?: boolean;
  readonly includePilotTraces?: boolean;
  readonly coordinateScalarMode?: "preserve" | "automatic" | "explicit";
  readonly explicitCoordinateScalar?: number;
  readonly preserveRawMetadata?: boolean;
  readonly processingHistory?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (completedTraces: number, totalTraces: number) => void;
}

export interface SmartSoloConversionSummary {
  readonly traceCount: number;
  readonly estimatedBytes: number;
  readonly diagnostics: readonly Diagnostic[];
}
