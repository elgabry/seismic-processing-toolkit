import { SmartSoloFormatError, SmartSoloTruncationError } from "../../../core/errors/errors";
import type { Diagnostic } from "../../../core/errors/errors";
import type { RandomAccessSource } from "../../source/random-access-source";
import { SmartSolo8058, decodeBcd, decodeDms, decodeUint24 } from "./smartsolo8058-constants";
import { smartSoloDiagnostic } from "./smartsolo8058-diagnostics";
import type { SmartSolo8058Headers, SmartSoloRawHeader } from "./types";

function requireRange(source: RandomAccessSource, length: number): void {
  if (!Number.isSafeInteger(length) || length < 0 || length > source.size) {
    throw new SmartSoloTruncationError("SmartSolo headers extend beyond the available source.", smartSoloDiagnostic("error", "SMARTSOLO_TRUNCATED_HEADERS", `The declared SmartSolo header prefix requires ${length} bytes but ${source.size} are available.`, false, source.name, source.size));
  }
}

function positiveBcd(bytes: Uint8Array, offset: number, fallback: number, diagnostics: ReturnType<typeof smartSoloDiagnostic>[], fileName: string): number {
  const value = decodeBcd(bytes, offset, 1);
  if (value === undefined) {
    diagnostics.push(smartSoloDiagnostic("warning", "SMARTSOLO_INVALID_BCD", `Header byte ${offset} is not valid BCD; the documented fallback ${fallback} was used.`, true, fileName, offset));
    return fallback;
  }
  return value || fallback;
}

function rawHeader(type: SmartSoloRawHeader["type"], prefix: Uint8Array<ArrayBuffer>, byteOffset: number, length: number): SmartSoloRawHeader {
  return { type, byteOffset, rawBytes: prefix.slice(byteOffset, byteOffset + length) };
}

/** Parses only the 8058 fields consumed by the legacy converter and preserves every header byte read. */
export class SmartSolo8058HeadersReader {
  public static async read(source: RandomAccessSource, signal?: AbortSignal): Promise<SmartSolo8058Headers> {
    requireRange(source, SmartSolo8058.blockBytes);
    const first = new Uint8Array(await source.read(0, SmartSolo8058.blockBytes, signal));
    if (first[2] !== SmartSolo8058.formatCodeHigh || first[3] !== SmartSolo8058.formatCodeLow) {
      throw new SmartSoloFormatError("The source is not a SmartSolo SEG-D format-8058 file.", smartSoloDiagnostic("error", "SMARTSOLO_FORMAT_MISMATCH", "Expected format signature 0x8058 at bytes 2–3.", false, source.name, 2));
    }
    const diagnostics: Diagnostic[] = [];
    const additionalGeneralHeaderBlocks = (first[SmartSolo8058.additionalGeneralHeadersOffset] ?? 0) >>> 4;
    const channelSetBlocks = positiveBcd(first, SmartSolo8058.channelSetCountOffset, 16, diagnostics, source.name);
    const skewBlocks = positiveBcd(first, SmartSolo8058.skewBlockCountOffset, 0, diagnostics, source.name);
    const extendedHeaderBlocks = positiveBcd(first, SmartSolo8058.extendedHeaderBlocksOffset, 32, diagnostics, source.name);
    const externalHeaderBlocks = positiveBcd(first, SmartSolo8058.externalHeaderBlocksOffset, 32, diagnostics, source.name);
    const blockCounts = [additionalGeneralHeaderBlocks + 1, channelSetBlocks, skewBlocks, extendedHeaderBlocks, externalHeaderBlocks];
    if (blockCounts.some((count) => count > SmartSolo8058.maximumHeaderBlocks)) {
      throw new SmartSoloFormatError("SmartSolo header block count exceeds the supported bounded-layout limit.", smartSoloDiagnostic("error", "SMARTSOLO_HEADER_BLOCK_LIMIT", `A declared header block count exceeds ${SmartSolo8058.maximumHeaderBlocks}.`, false, source.name));
    }
    const generalBytes = (additionalGeneralHeaderBlocks + 1) * SmartSolo8058.blockBytes;
    const extendedOffset = generalBytes + (channelSetBlocks + skewBlocks) * SmartSolo8058.blockBytes;
    const externalOffset = extendedOffset + extendedHeaderBlocks * SmartSolo8058.blockBytes;
    const dataOffset = externalOffset + externalHeaderBlocks * SmartSolo8058.blockBytes;
    requireRange(source, dataOffset);
    const rawPrefix = new Uint8Array(await source.read(0, dataOffset, signal));
    const view = new DataView(rawPrefix.buffer, rawPrefix.byteOffset, rawPrefix.byteLength);
    const revisionMajor = additionalGeneralHeaderBlocks >= 1 ? rawPrefix[SmartSolo8058.generalHeaderTwoOffset + SmartSolo8058.revisionMajorOffset] ?? 0 : 1;
    const revisionMinor = additionalGeneralHeaderBlocks >= 1 ? rawPrefix[SmartSolo8058.generalHeaderTwoOffset + SmartSolo8058.revisionMinorOffset] ?? 0 : 0;
    const revision = `${revisionMajor}.${revisionMinor}`;
    if (revision !== "1.0" && revision !== "2.1") {
      throw new SmartSoloFormatError(`SmartSolo SEG-D revision ${revision} is not supported.`, smartSoloDiagnostic("error", "SMARTSOLO_UNSUPPORTED_REVISION", "Only legacy-verified SmartSolo 8058 revisions 1.0 and 2.1 are supported.", false, source.name, SmartSolo8058.generalHeaderTwoOffset + SmartSolo8058.revisionMajorOffset));
    }
    const sourceLine = additionalGeneralHeaderBlocks >= 2 ? decodeUint24(rawPrefix, SmartSolo8058.generalHeaderThreeOffset + SmartSolo8058.sourceLineOffset) ?? 0 : 0;
    const sourcePoint = additionalGeneralHeaderBlocks >= 2 ? decodeUint24(rawPrefix, SmartSolo8058.generalHeaderThreeOffset + SmartSolo8058.sourcePointOffset) ?? 0 : 0;
    const sampleIntervalMicroseconds = view.getUint32(extendedOffset + 4, false) || Math.round((rawPrefix[SmartSolo8058.baseScanOffset] ?? 0) / 16 * 1000) || 1000;
    const declaredTraceCount = view.getUint32(extendedOffset + 8, false);
    const declaredSamplesPerTrace = view.getUint32(extendedOffset + 12, false);
    const sourceType = extendedHeaderBlocks >= 2 ? view.getUint32(extendedOffset + 32, false) : 0;
    const extendedGatherType = extendedHeaderBlocks >= 2 ? view.getUint16(extendedOffset + 36, false) : 0;
    const gatherType = extendedGatherType || ((rawPrefix[SmartSolo8058.gatherTypeOffset] ?? 0) & 0x0f);
    const fileSourceEastingCentimetres = view.getInt32(externalOffset + 8, false);
    const fileSourceNorthingCentimetres = view.getInt32(externalOffset + 12, false);
    const fileSourceElevationCentimetres = view.getInt32(externalOffset + 16, false);
    const fileSourceLatitude = decodeDms(view.getInt32(externalOffset + 20, false), view.getUint16(externalOffset + 24, false));
    const fileSourceLongitude = decodeDms(view.getInt32(externalOffset + 26, false), view.getUint16(externalOffset + 30, false));
    const rawHeaders: SmartSoloRawHeader[] = [];
    for (let index = 0; index <= additionalGeneralHeaderBlocks; index += 1) rawHeaders.push(rawHeader("general", rawPrefix, index * SmartSolo8058.blockBytes, SmartSolo8058.blockBytes));
    for (let index = 0; index < channelSetBlocks + skewBlocks; index += 1) rawHeaders.push(rawHeader("channel-set", rawPrefix, generalBytes + index * SmartSolo8058.blockBytes, SmartSolo8058.blockBytes));
    rawHeaders.push(rawHeader("extended", rawPrefix, extendedOffset, extendedHeaderBlocks * SmartSolo8058.blockBytes));
    rawHeaders.push(rawHeader("external", rawPrefix, externalOffset, externalHeaderBlocks * SmartSolo8058.blockBytes));
    diagnostics.push(smartSoloDiagnostic("info", "SMARTSOLO_RAW_HEADERS_PRESERVED", "All parsed SmartSolo header bytes are retained in the reader model; unmodeled vendor fields are not inferred.", true, source.name));
    return { rawPrefix, rawHeaders, additionalGeneralHeaderBlocks, channelSetBlocks, skewBlocks, extendedHeaderBlocks, externalHeaderBlocks, dataOffset, revision, gatherType, sampleIntervalMicroseconds, declaredTraceCount, declaredSamplesPerTrace, sourceType, fieldRecordNumber: view.getUint32(externalOffset, false), sourceLine, sourcePoint, fileSourceEastingCentimetres, fileSourceNorthingCentimetres, fileSourceElevationCentimetres, fileSourceLatitude, fileSourceLongitude, diagnostics };
  }
}
