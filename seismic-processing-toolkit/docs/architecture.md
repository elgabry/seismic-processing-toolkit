# Architecture

Dependencies flow one way: `core` has types/math/errors; `io` reads and writes files without DOM access; `sweep` and `processing` are deterministic DSP/domain modules; `workers` execute transferable batches; `app`, `visualization`, and `ui` consume public interfaces.

Dataset lifecycle: `BlobSource` → header detection → `SegyTraceIndexBuilder` → immutable `SegyDataset` → lazy `SegyTraceAccessor` and byte-limited decoded cache. Closing a dataset disposes the cache.

Worker lifecycle: the main thread creates a Vite module worker, assigns an internal unique job ID, sends an `init` message with a stable plan key, transfers an owned `TraceBlock`, and receives a discriminated result/error/progress message. Plans are capped and reused only when every result-affecting correlation input matches. Dataset-cache buffers are never transferred; cancellation is checked between trace jobs.

Processing lifecycle: UI parameters validate against metadata, are stored in a serializable `ProcessingGraph`, then a processor operates on bounded `TraceBlock`s. DSP modules have no DOM or parser dependencies.
