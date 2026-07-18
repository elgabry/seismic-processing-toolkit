# Adding a processor

Implement `SeismicProcessor<P>` with a stable ID/version, metadata validation, a resource estimate, and bounded `processBlock` implementation. Register it once in `ProcessorRegistry`; add its serializable parameters to a `ProcessingGraphNode`; keep DOM code in `ui`/`app` only.

Time inputs arriving from UI in milliseconds must be converted once to seconds before calling a processor. Tests must cover parameter validation, a deterministic synthetic block, cancellation/progress behaviour when applicable, and a resource estimate appropriate to the algorithm.
# Conversion, geometry, and export modules

Use `io/segd/smartsolo8058` for supported SmartSolo detection, opening, and streaming conversion. Use `geometry` for raw/scaled coordinate analysis; it intentionally has no Canvas dependency. Use `export/csv` and `export/png` with an `OutputSink` or Blob return value from UI code only. These modules do not mutate source samples, active trace views, or processing graphs.
