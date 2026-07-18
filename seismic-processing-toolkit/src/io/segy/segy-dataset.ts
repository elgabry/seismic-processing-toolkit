import type { Diagnostic } from "../../core/errors/errors";
import type { RandomAccessSource } from "../source/random-access-source";
import type { SampleCodec } from "./codecs/sample-codec";
import type { BinaryHeader } from "./headers/binary-header";
import type { TextualHeader } from "./headers/textual-header";
import type { SegyTraceIndex } from "./index/segy-trace-index";
import { SegyTraceAccessor } from "./segy-trace-accessor";

/** Immutable parsed metadata plus lazy trace access for one SEG-Y source. */
export class SegyDataset {
  public readonly id = crypto.randomUUID();
  public readonly name: string;
  public readonly traceCount: number;
  public readonly traces: SegyTraceAccessor;

  public constructor(
    public readonly source: RandomAccessSource,
    public readonly textualHeaders: readonly TextualHeader[],
    public readonly binaryHeader: BinaryHeader,
    public readonly traceIndex: SegyTraceIndex,
    public readonly diagnostics: readonly Diagnostic[],
    public readonly codec: SampleCodec,
    public readonly littleEndian: boolean,
    cacheBytes: number
  ) {
    this.name = source.name; this.traceCount = traceIndex.traceCount;
    this.traces = new SegyTraceAccessor(source, traceIndex, codec, littleEndian, cacheBytes);
  }

  public close(): void {
    this.traces.dispose();
    const disposable = this.source as RandomAccessSource & Partial<{ dispose(): void }>;
    disposable.dispose?.();
  }
}
