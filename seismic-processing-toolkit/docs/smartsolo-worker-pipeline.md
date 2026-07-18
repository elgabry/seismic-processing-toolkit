# SmartSolo worker pipeline

The browser conversion path uses a Vite module worker for SmartSolo 8058 detection, header parsing, bounded indexing, trace decoding, and SEG-Y-header mapping. It does not move DOM, dialog, or output-sink code to the worker.

1. The main thread creates a unique job and sends a cloned local `File` with `open`.
2. The worker detects/indexes through bounded Blob slices and returns acquisition metadata and preview bytes.
3. The main thread selects an `OutputSink`, asks the worker to `prepare`, and creates the existing `SegyWriter` around virtual mapped headers.
4. The writer requests a batch only when ready. The worker decodes/maps at most the configured 4 MiB batch budget and transfers newly owned header/sample/offset buffers.
5. The main thread writes that batch, then pulls the next one. No converted-survey sample array or unbounded worker queue exists.
6. `cancel` and `dispose` are job-ID scoped. Cancellation aborts the sink through `SegyWriter`; stale result messages are ignored by the client.

Progress messages report header/detection/indexing/output preparation/decode/mapping/writing phases with trace or byte counts where available. The worker owns the cloned file and index. The main thread owns UI state, browser output destination, `SegyWriter`, and reopening the finished local SEG-Y. Only newly allocated published batch buffers are transferred; source-cache and live dataset buffers are never detached.

The pipeline remains limited to the documented legacy-compatible SmartSolo 8058 revisions 1.0 and 2.1. It is not a generic SEG-D worker.
