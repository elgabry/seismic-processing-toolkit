# Memory model

`BlobSource.read()` uses `Blob.slice()` and rejects out-of-range reads. Opening reads 3600 bytes, then only extended text headers and bounded trace-header windows (64 KiB by default, configurable for direct index-builder callers). The index stores numeric columns in typed arrays; it never holds decoded samples or allocates an array proportional to file size.

`SegyTraceAccessor` decodes one requested trace into a configurable 64 MiB LRU by default. A `TraceBlock` packs variable-length traces into one `Float32Array` plus `Uint32Array` sample offsets. Main-thread code may transfer those new block buffers to workers; it never transfers cached trace arrays.

`CachedSource` is optional and byte-capped. `SegyWriter` streams to an `OutputSink`; a no-edit export copies raw source chunks byte-for-byte, while conversion decodes and re-encodes one trace at a time. `BlobOutputSink` has a configurable 512 MiB safety limit. File System Access or WritableStream sinks avoid a multi-gigabyte Blob allocation.

The correlation worker receives only caller-owned `TraceBlock` buffers as transferables; decoded dataset-cache arrays stay on the main thread. It caches at most eight plans keyed by sweep content, sample interval, and correlation options, yields between traces so cancellation messages can be observed, and releases all plans when the worker terminates.

SmartSolo 8058 opening reads a bounded header prefix, then scans 244-byte trace headers through a 64 KiB window. The index is columnar and never contains samples. Conversion reads/decodes one Float32 trace at a time and streams it through `SegyWriter`; no converted survey-sized sample array exists. CSV encodes bounded text chunks to `OutputSink`; wide sample CSV is deliberately capped. PNG validates pixel count before allocating a temporary canvas and releases it when blob encoding completes.

The browser SmartSolo path uses a 4 MiB default worker batch budget. The worker holds the file and index, creates fresh batch header/sample/offset buffers, transfers them once to the main thread, and does not transfer Blob-cache or dataset-cache buffers. `SegyWriter` consumes a batch before asking for the next one, so at most one decoded conversion batch is in flight. The map grid is built once per dialog; hover, click, and box selection query relevant cells rather than scanning every point on pointer movement.

Publication-section export checks its exact requested pixel count before allocating a fresh RGBA image. The percentile is two bounded passes over trace typed arrays and a fixed 4096-bin histogram; it never sorts all samples into a JavaScript array. Rasterization writes directly to `ImageData`, uses interpolation/vertical averaging only for display, and retains at most four temporary AGC-conditioned traces. It does not create a second complete survey matrix or modify decoded cache samples.
