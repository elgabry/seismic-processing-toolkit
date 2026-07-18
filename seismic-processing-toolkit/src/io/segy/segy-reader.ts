import { type Diagnostic, SegyFormatError } from "../../core/errors/errors";
import { BlobSource } from "../source/blob-source";
import type { RandomAccessSource } from "../source/random-access-source";
import { defaultSampleCodecRegistry, type SampleCodecRegistry } from "./codecs/sample-codec-registry";
import { BinaryHeader } from "./headers/binary-header";
import { TextualHeader, type TextualEncoding } from "./headers/textual-header";
import { SegyTraceIndexBuilder, type SegyTraceIndexProgress } from "./index/segy-trace-index-builder";
import { SegyDataset } from "./segy-dataset";

export type SegyOpenProgress = SegyTraceIndexProgress | { readonly phase: "opening"; readonly bytesScanned: number; readonly totalBytes: number; readonly traceCount: number; };
export interface SegyOpenOptions {
  readonly endianness?: "auto" | "big" | "little";
  readonly textualEncoding?: "auto" | TextualEncoding;
  readonly revision?: "auto" | 0 | 1 | 2;
  readonly cacheBytes?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SegyOpenProgress) => void;
}

interface Candidate { readonly littleEndian: boolean; readonly header: BinaryHeader; readonly score: number; }

function toSource(input: Blob | RandomAccessSource): RandomAccessSource { return input instanceof Blob ? new BlobSource(input) : input; }
function candidateScore(header: BinaryHeader, codecs: SampleCodecRegistry): number {
  const value = header.values;
  let score = 0;
  if (codecs.supports(value.sampleFormatCode)) score += 100;
  else if (value.sampleFormatCode === 4) score += 30;
  if (value.sampleIntervalMicroseconds >= 10 && value.sampleIntervalMicroseconds <= 1_000_000) score += 20;
  if (value.samplesPerTrace > 0 && value.samplesPerTrace <= 65_535) score += 20;
  if (value.revisionRaw === 0 || value.revisionRaw === 0x0100 || value.revisionRaw === 0x0200) score += 15;
  if (value.fixedLengthTraceFlag === 0 || value.fixedLengthTraceFlag === 1) score += 5;
  if (value.extendedTextualHeaderCount >= -1 && value.extendedTextualHeaderCount <= 2048) score += 5;
  return score;
}

function selectCandidate(raw: ArrayBuffer, options: SegyOpenOptions, codecs: SampleCodecRegistry): Candidate {
  if (options.endianness === "big") { const header = new BinaryHeader(raw, false); return { littleEndian: false, header, score: candidateScore(header, codecs) }; }
  if (options.endianness === "little") { const header = new BinaryHeader(raw, true); return { littleEndian: true, header, score: candidateScore(header, codecs) }; }
  const bigHeader = new BinaryHeader(raw, false); const littleHeader = new BinaryHeader(raw, true);
  const big = { littleEndian: false, header: bigHeader, score: candidateScore(bigHeader, codecs) };
  const little = { littleEndian: true, header: littleHeader, score: candidateScore(littleHeader, codecs) };
  return little.score > big.score ? little : big;
}

/** Opens metadata with a 3600-byte read, then indexes trace headers in bounded reads. */
export class SegyReader {
  public static async open(input: Blob | RandomAccessSource, options: SegyOpenOptions = {}, codecs: SampleCodecRegistry = defaultSampleCodecRegistry): Promise<SegyDataset> {
    const source = toSource(input);
    if (source.size < 3600) throw new SegyFormatError("Source is too short to hold SEG-Y reel headers.", {
      severity: "error", code: "SHORT_REEL_HEADER", message: `${source.name} has ${source.size} bytes; SEG-Y requires at least 3600.`, fileName: source.name, byteOffset: 0, recoverable: false
    });
    options.onProgress?.({ phase: "opening", bytesScanned: 0, totalBytes: source.size, traceCount: 0 });
    const initial = await source.read(0, 3600, options.signal);
    const initialBytes = new Uint8Array(initial);
    const detected = TextualHeader.detect(initialBytes.subarray(0, 3200));
    const textual = options.textualEncoding === undefined || options.textualEncoding === "auto" ? detected.header : new TextualHeader(initialBytes.subarray(0, 3200), options.textualEncoding);
    const candidate = selectCandidate(initial.slice(3200, 3600), options, codecs);
    const diagnostics: Diagnostic[] = [];
    if (candidate.score < 100) diagnostics.push({ severity: "warning", code: "IMPLAUSIBLE_HEADER_INTERPRETATION", message: `Selected ${candidate.littleEndian ? "little" : "big"}-endian binary header scored ${candidate.score}; verify byte order and sample format.`, fileName: source.name, byteOffset: 3200, recoverable: true });
    if (Math.abs(detected.scores.ascii - detected.scores.ebcdic) < 20 && (options.textualEncoding === undefined || options.textualEncoding === "auto")) diagnostics.push({ severity: "warning", code: "AMBIGUOUS_TEXTUAL_ENCODING", message: "ASCII and EBCDIC textual-header scores are close; verify the selected encoding.", fileName: source.name, byteOffset: 0, recoverable: true });
    const revision = options.revision === undefined || options.revision === "auto" ? candidate.header.values.revision : options.revision;
    const headerCount = candidate.header.values.extendedTextualHeaderCount;
    const extended = await this.readExtendedHeaders(source, headerCount, textual.encoding, options, diagnostics);
    const dataStartOffset = 3600 + extended.length * 3200;
    const codec = codecs.get(candidate.header.values.sampleFormatCode);
    const indexed = await SegyTraceIndexBuilder.build(source, codec, {
      dataStartOffset, nominalSamplesPerTrace: candidate.header.values.samplesPerTrace, nominalSampleIntervalMicroseconds: candidate.header.values.sampleIntervalMicroseconds,
      littleEndian: candidate.littleEndian, revision, signal: options.signal,
      onProgress: (progress) => options.onProgress?.(progress)
    });
    diagnostics.push(...indexed.diagnostics);
    if (revision !== candidate.header.values.revision) diagnostics.push({ severity: "info", code: "REVISION_OVERRIDE", message: `Revision interpretation overridden to ${revision}.`, fileName: source.name, byteOffset: 3500, recoverable: true });
    return new SegyDataset(source, [textual, ...extended], candidate.header, indexed.index, diagnostics, codec, candidate.littleEndian, options.cacheBytes ?? 64 * 1024 * 1024);
  }

  private static async readExtendedHeaders(source: RandomAccessSource, headerCount: number, encoding: TextualEncoding, options: SegyOpenOptions, diagnostics: Diagnostic[]): Promise<TextualHeader[]> {
    if (headerCount === 0) return [];
    if (headerCount > 0) {
      const available = Math.floor((source.size - 3600) / 3200);
      const count = Math.min(headerCount, available);
      if (count !== headerCount) diagnostics.push({ severity: "warning", code: "TRUNCATED_EXTENDED_TEXT_HEADERS", message: `Binary header declares ${headerCount} extended textual headers, but only ${count} fit in the source.`, fileName: source.name, byteOffset: 3600, recoverable: true });
      const bytes = await source.read(3600, count * 3200, options.signal);
      const result: TextualHeader[] = [];
      for (let index = 0; index < count; index += 1) result.push(new TextualHeader(new Uint8Array(bytes, index * 3200, 3200), encoding));
      return result;
    }
    if (headerCount !== -1) {
      diagnostics.push({ severity: "warning", code: "INVALID_EXTENDED_TEXT_COUNT", message: `Invalid extended-textual-header count ${headerCount}; assuming none.`, fileName: source.name, byteOffset: 3504, recoverable: true });
      return [];
    }
    const result: TextualHeader[] = [];
    for (let index = 0; index < 128 && 3600 + (index + 1) * 3200 <= source.size; index += 1) {
      const bytes = await source.read(3600 + index * 3200, 3200, options.signal);
      const header = new TextualHeader(bytes, encoding);
      result.push(header);
      if (/END\s+TEXTUAL\s+HEADER|\(\(SEG:.*ENDTEXT\)\)/i.test(header.text)) return result;
    }
    diagnostics.push({ severity: "warning", code: "UNTERMINATED_EXTENDED_TEXT_HEADERS", message: "Extended textual header count is -1 but no EndText stanza was found within 128 cards; indexing begins after the scanned records.", fileName: source.name, byteOffset: 3600, recoverable: true });
    return result;
  }
}
