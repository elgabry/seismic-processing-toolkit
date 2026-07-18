import type { OutputSink } from "../../io/sink/output-sink";

export type CsvValue = string | number | bigint | null | undefined;
export interface CsvEncodingOptions { readonly delimiter?: "," | "\t"; readonly lineEnding?: "\n" | "\r\n"; readonly numericPrecision?: number; readonly bufferBytes?: number; }

function formatValue(value: CsvValue, options: Required<CsvEncodingOptions>): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") { if (!Number.isFinite(value)) return ""; return options.numericPrecision < 0 ? String(value) : value.toFixed(options.numericPrecision); }
  return String(value);
}
function escape(value: string, delimiter: string): string { return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }

/** Incremental RFC-4180-compatible encoder; only a small encoded-text buffer is retained. */
export class CsvEncoder {
  private readonly options: Required<CsvEncodingOptions>;
  private readonly textEncoder = new TextEncoder();
  private buffer = "";
  public constructor(private readonly sink: OutputSink, options: CsvEncodingOptions = {}) {
    const numericPrecision = options.numericPrecision ?? -1;
    if (!Number.isInteger(numericPrecision) || numericPrecision < -1 || numericPrecision > 15) throw new RangeError("CSV numeric precision must be -1 or an integer from 0 through 15.");
    this.options = { delimiter: options.delimiter ?? ",", lineEnding: options.lineEnding ?? "\r\n", numericPrecision, bufferBytes: options.bufferBytes ?? 64 * 1024 };
  }
  public async writeRow(values: readonly CsvValue[]): Promise<void> {
    this.buffer += values.map((value) => escape(formatValue(value, this.options), this.options.delimiter)).join(this.options.delimiter) + this.options.lineEnding;
    if (this.buffer.length >= this.options.bufferBytes) await this.flush();
  }
  public async flush(): Promise<void> { if (this.buffer.length === 0) return; const chunk = this.textEncoder.encode(this.buffer); this.buffer = ""; await this.sink.write(chunk); }
  public async close(): Promise<void> { await this.flush(); await this.sink.close(); }
  public async abort(reason?: unknown): Promise<void> { this.buffer = ""; await this.sink.abort(reason); }
}
