import { CsvExportError } from "../../core/errors/errors";
import type { OutputSink } from "../../io/sink/output-sink";
import { CsvEncoder, type CsvEncodingOptions, type CsvValue } from "./csv-encoder";

export interface CsvExportProgress { readonly rowsWritten: number; }
export interface CsvExportOptions extends CsvEncodingOptions { readonly includeHeader?: boolean; readonly signal?: AbortSignal; readonly onProgress?: (progress: CsvExportProgress) => void; }

/** Owns sink close/abort semantics for CSV workflows. */
export class CsvExportService {
  public static async write(sink: OutputSink, header: readonly CsvValue[], rows: AsyncIterable<readonly CsvValue[]>, options: CsvExportOptions = {}): Promise<number> {
    const encoder = new CsvEncoder(sink, options); let rowsWritten = 0;
    try {
      if (options.includeHeader ?? true) await encoder.writeRow(header);
      for await (const row of rows) {
        if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
        await encoder.writeRow(row); rowsWritten += 1; options.onProgress?.({ rowsWritten });
      }
      await encoder.close(); return rowsWritten;
    } catch (error) {
      try { await encoder.abort(error); } catch { /* Preserve the export failure. */ }
      if (error instanceof Error) throw error;
      throw new CsvExportError("CSV export failed.", { severity: "error", code: "CSV_EXPORT_FAILED", message: String(error), recoverable: false });
    }
  }
}
