import { SmartSoloMappingError } from "../../../core/errors/errors";
import type { Diagnostic } from "../../../core/errors/errors";
import { BinaryHeader } from "../../segy/headers/binary-header";
import { TextualHeader, type TextualEncoding } from "../../segy/headers/textual-header";
import type { SmartSolo8058Reader } from "./smartsolo8058-reader";
import type { SmartSoloConversionOptions, SmartSoloTraceMetadata } from "./types";
import { smartSoloDiagnostic } from "./smartsolo8058-diagnostics";

export interface NormalizedSmartSoloConversionOptions {
  readonly outputRevision: 0 | 1 | 2;
  readonly sampleFormatCode: number;
  readonly outputEndianness: "big" | "little";
  readonly textualEncoding: TextualEncoding;
  readonly includeAuxiliaryTraces: boolean;
  readonly includePilotTraces: boolean;
  readonly coordinateScalarMode: "preserve" | "automatic" | "explicit";
  readonly explicitCoordinateScalar?: number;
  readonly preserveRawMetadata: boolean;
  readonly processingHistory: boolean;
}

export interface SmartSoloSegyTraceHeader {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly diagnostics: readonly Diagnostic[];
}

function baseName(name: string): string { return name.split(/[\\/]/).pop() ?? name; }
function requireInt32(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0x7fffffff) throw new SmartSoloMappingError(`${field} cannot be represented in a SEG-Y int32 field.`, smartSoloDiagnostic("error", "SMARTSOLO_MAPPING_RANGE", `${field}=${value} is outside signed 32-bit range.`, false, undefined, undefined));
  return value;
}
function requireUint16(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) throw new SmartSoloMappingError(`${field} cannot be represented in a SEG-Y uint16 field.`, smartSoloDiagnostic("error", "SMARTSOLO_MAPPING_RANGE", `${field}=${value} is outside unsigned 16-bit range.`, false));
  return value;
}
function coordinateRaw(centimetres: number, options: NormalizedSmartSoloConversionOptions): { readonly raw: number; readonly scalar: number } {
  if (options.coordinateScalarMode === "automatic" || options.coordinateScalarMode === "preserve") return { raw: requireInt32(centimetres, "SmartSolo centimetre coordinate"), scalar: -100 };
  const scalar = options.explicitCoordinateScalar;
  if (scalar === undefined || !Number.isSafeInteger(scalar) || scalar < -0x8000 || scalar > 0x7fff) throw new SmartSoloMappingError("An explicit coordinate scalar must be a signed 16-bit integer.", smartSoloDiagnostic("error", "SMARTSOLO_INVALID_COORDINATE_SCALAR", "Choose a representable SEG-Y coordinate scalar.", false));
  const metres = centimetres / 100;
  const raw = scalar > 0 ? metres / scalar : scalar < 0 ? metres * Math.abs(scalar) : metres;
  if (!Number.isInteger(raw)) throw new SmartSoloMappingError("The requested coordinate scalar cannot represent SmartSolo centimetre coordinates without rounding.", smartSoloDiagnostic("error", "SMARTSOLO_COORDINATE_PRECISION", "Use automatic scalar -100 or select a scalar that exactly represents centimetre coordinates.", false));
  return { raw: requireInt32(raw, "Mapped coordinate"), scalar };
}
function writeGps48(bytes: Uint8Array<ArrayBuffer>, offset: number, degrees: number): void {
  if (!Number.isFinite(degrees) || Math.abs(degrees) > 180) return;
  let value = BigInt(Math.round(degrees * 655_360_000));
  if (value < 0n) value += 1n << 48n;
  for (let index = 5; index >= 0; index -= 1) { bytes[offset + index] = Number(value & 0xffn); value >>= 8n; }
}
function traceIdentificationCode(trace: SmartSoloTraceMetadata): number { return trace.traceClass === "auxiliary" ? 2 : trace.traceClass === "pilot" ? 3 : 1; }

export function normalizeSmartSoloConversionOptions(options: SmartSoloConversionOptions = {}): NormalizedSmartSoloConversionOptions {
  const coordinateScalarMode = options.coordinateScalarMode ?? "automatic";
  return {
    outputRevision: options.outputRevision ?? 1,
    sampleFormatCode: options.sampleFormatCode ?? 5,
    outputEndianness: options.outputEndianness ?? "big",
    textualEncoding: options.textualEncoding ?? "ascii",
    includeAuxiliaryTraces: options.includeAuxiliaryTraces ?? true,
    includePilotTraces: options.includePilotTraces ?? true,
    coordinateScalarMode,
    ...(options.explicitCoordinateScalar === undefined ? {} : { explicitCoordinateScalar: options.explicitCoordinateScalar }),
    preserveRawMetadata: options.preserveRawMetadata ?? true,
    processingHistory: options.processingHistory ?? true
  };
}

/** Explicit SmartSolo-to-SEG-Y trace mapping, including legacy RG source/receiver reversal. */
export function mapSmartSoloTraceToSegyHeader(reader: SmartSolo8058Reader, traceId: number, outputTraceId: number, options: NormalizedSmartSoloConversionOptions): SmartSoloSegyTraceHeader {
  const trace = reader.index.traceAt(traceId);
  const header = new Uint8Array(240);
  const view = new DataView(header.buffer);
  const receiverIsFileSource = reader.headers.gatherType === 1;
  const receiverEasting = receiverIsFileSource ? trace.sourceEastingCentimetres : trace.receiverEastingCentimetres;
  const receiverNorthing = receiverIsFileSource ? trace.sourceNorthingCentimetres : trace.receiverNorthingCentimetres;
  const receiverElevation = receiverIsFileSource ? trace.sourceElevationCentimetres : trace.receiverElevationCentimetres;
  const sourceEasting = receiverIsFileSource ? trace.receiverEastingCentimetres : trace.sourceEastingCentimetres;
  const sourceNorthing = receiverIsFileSource ? trace.receiverNorthingCentimetres : trace.sourceNorthingCentimetres;
  const sourceElevation = receiverIsFileSource ? trace.receiverElevationCentimetres : trace.sourceElevationCentimetres;
  const receiverX = coordinateRaw(receiverEasting, options); const receiverY = coordinateRaw(receiverNorthing, options);
  const sourceX = coordinateRaw(sourceEasting, options); const sourceY = coordinateRaw(sourceNorthing, options);
  if (receiverX.scalar !== receiverY.scalar || receiverX.scalar !== sourceX.scalar || receiverX.scalar !== sourceY.scalar) throw new SmartSoloMappingError("Source and receiver coordinates produced inconsistent scalar mappings.", smartSoloDiagnostic("error", "SMARTSOLO_INCONSISTENT_SCALAR", "SmartSolo source and receiver coordinates must use one SEG-Y coordinate scalar per trace.", false, reader.source.name, trace.traceHeaderOffset, traceId));
  const offsetMetres = Math.hypot((sourceEasting - receiverEasting) / 100, (sourceNorthing - receiverNorthing) / 100);
  view.setInt32(0, requireInt32(outputTraceId + 1, "Trace sequence"), false); view.setInt32(4, requireInt32(outputTraceId + 1, "Trace sequence"), false);
  view.setInt32(8, requireInt32(trace.fieldRecordNumber, "Field record"), false); view.setInt32(12, requireInt32(trace.traceNumber || trace.channelNumber || outputTraceId + 1, "Trace number"), false);
  view.setInt32(16, requireInt32(reader.headers.sourcePoint, "Source point"), false); view.setInt16(28, traceIdentificationCode(trace), false);
  view.setInt32(36, requireInt32(Math.round(offsetMetres), "Coordinate-derived offset"), false);
  view.setInt32(40, requireInt32(receiverElevation, "Receiver elevation"), false); view.setInt32(44, requireInt32(sourceElevation, "Source elevation"), false);
  view.setInt16(68, -100, false); view.setInt16(70, receiverX.scalar, false);
  view.setInt32(72, sourceX.raw, false); view.setInt32(76, sourceY.raw, false);
  view.setInt32(80, receiverX.raw, false); view.setInt32(84, receiverY.raw, false);
  view.setInt16(88, 1, false); view.setUint16(114, requireUint16(trace.sampleCount, "Sample count"), false); view.setUint16(116, requireUint16(trace.sampleIntervalMicroseconds, "Sample interval"), false);
  view.setInt32(170, requireInt32(trace.receiverSerial, "Receiver serial"), false);
  const receiverLatitude = receiverIsFileSource ? reader.headers.fileSourceLatitude : trace.receiverLatitude;
  const receiverLongitude = receiverIsFileSource ? reader.headers.fileSourceLongitude : trace.receiverLongitude;
  const sourceLatitude = receiverIsFileSource ? trace.receiverLatitude : reader.headers.fileSourceLatitude;
  const sourceLongitude = receiverIsFileSource ? trace.receiverLongitude : reader.headers.fileSourceLongitude;
  writeGps48(header, 206, receiverLatitude); writeGps48(header, 212, receiverLongitude); writeGps48(header, 218, sourceLatitude); writeGps48(header, 224, sourceLongitude);
  return { bytes: header, diagnostics: [] };
}

export function createSmartSoloTextualHeaders(reader: SmartSolo8058Reader, options: NormalizedSmartSoloConversionOptions): readonly TextualHeader[] {
  const gather = reader.headers.gatherType === 0 ? "SHOT GATHER (SG)" : reader.headers.gatherType === 1 ? "RECEIVER GATHER (RG)" : reader.headers.gatherType === 2 ? "CONTINUOUS RECEIVER GATHER (CG)" : `TYPE ${reader.headers.gatherType}`;
  const primary = new TextualHeader(new Uint8Array(3200), options.textualEncoding).withCards([
    `C01 CONVERTED FROM SMARTSOLO SEG-D 8058: ${baseName(reader.source.name)}`,
    `C02 SEG-D REVISION ${reader.headers.revision}   GATHER TYPE: ${gather}`,
    `C03 TRACES: ${reader.traceCount}   INTERVAL: ${reader.headers.sampleIntervalMicroseconds / 1000} MS`,
    `C04 FFID ${reader.headers.fieldRecordNumber}   SOURCE LINE ${reader.headers.sourceLine}   SOURCE POINT ${reader.headers.sourcePoint}`,
    "C05 IEEE FLOAT32, BIG-ENDIAN SMARTSOLO SAMPLES; SEG-Y OUTPUT SETTINGS FOLLOW",
    "C06 COORDINATES ARE SMARTSOLO CENTIMETRES; DEFAULT SCALAR -100 MEANS METRES",
    "C07 VENDOR GPS VALUES ARE PRESERVED IN TRACE BYTES 207-230 WHEN AVAILABLE",
    "C08 UNDOCUMENTED SMARTSOLO FIELDS ARE NOT INFERRED; SEE CONVERSION PROVENANCE"
  ], options.textualEncoding);
  if (!options.preserveRawMetadata) return [primary];
  let hex = "";
  for (const value of reader.headers.rawPrefix) hex += value.toString(16).padStart(2, "0").toUpperCase();
  // The textual-header card prefix consumes 29 characters; keep the complete
  // hex payload within SEG-Y's fixed 80-character card instead of relying on
  // TextualHeader.withCards() to truncate it.
  const chunkLength = 48;
  const headers: TextualHeader[] = [primary];
  for (let offset = 0, part = 1; offset < hex.length; offset += chunkLength * 40, part += 1) {
    const cards: string[] = [];
    for (let card = 0; card < 40 && offset + card * chunkLength < hex.length; card += 1) cards.push(`C${String(card + 1).padStart(2, "0")} SMARTSOLO8058 RAW ${String(part).padStart(3, "0")}: ${hex.slice(offset + card * chunkLength, offset + (card + 1) * chunkLength)}`);
    headers.push(new TextualHeader(new Uint8Array(3200), options.textualEncoding).withCards(cards, options.textualEncoding));
  }
  return headers;
}

export function createSmartSoloBinaryHeader(reader: SmartSolo8058Reader, options: NormalizedSmartSoloConversionOptions): BinaryHeader {
  const raw = new ArrayBuffer(400); const view = new DataView(raw);
  view.setInt32(0, reader.headers.sourceLine, options.outputEndianness === "little"); view.setUint16(16, requireUint16(reader.headers.sampleIntervalMicroseconds, "Binary sample interval"), options.outputEndianness === "little");
  view.setUint16(20, requireUint16(reader.headers.declaredSamplesPerTrace || (reader.index.sampleCounts[0] ?? 0), "Binary sample count"), options.outputEndianness === "little"); view.setUint16(24, requireUint16(options.sampleFormatCode, "Sample format"), options.outputEndianness === "little");
  view.setUint16(300, options.outputRevision << 8, options.outputEndianness === "little"); view.setUint16(302, 0, options.outputEndianness === "little");
  return new BinaryHeader(raw, options.outputEndianness === "little");
}
