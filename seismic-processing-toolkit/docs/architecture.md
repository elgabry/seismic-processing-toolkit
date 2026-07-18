# Architecture

Dependencies flow one way: `core` has types/math/errors; `io` reads and writes files without DOM access; `sweep` and `processing` are deterministic DSP/domain modules; `workers` execute transferable batches; `app`, `visualization`, and `ui` consume public interfaces.

Dataset lifecycle: `BlobSource` → header detection → `SegyTraceIndexBuilder` → immutable `SegyDataset` → lazy `SegyTraceAccessor` and byte-limited decoded cache. Closing a dataset disposes the cache.

Worker lifecycle: the main thread creates a Vite module worker, assigns an internal unique job ID, sends an `init` message with a stable plan key, transfers an owned `TraceBlock`, and receives a discriminated result/error/progress message. Plans are capped and reused only when every result-affecting correlation input matches. Dataset-cache buffers are never transferred; cancellation is checked between trace jobs.

Processing lifecycle: UI parameters validate against metadata, are stored in a serializable `ProcessingGraph`, then a processor operates on bounded `TraceBlock`s. DSP modules have no DOM or parser dependencies.

Phase 2 adds the same separation for conversion and export: `SmartSolo8058Reader` retains bounded raw headers and a typed trace index; `SmartSolo8058Converter` maps one decoded trace at a time through `SegyWriter` and an `OutputSink`. `geometry/` builds raw/scaled typed-array columns from public SEG-Y headers, while `visualization/map/` contains offline Canvas transforms and rendering only. CSV and PNG services consume those public render/domain models rather than DOM event handlers.

Phase 3 adds `SmartSoloWorkerClient` and `smartsolo.worker.ts`. A cloned `File` remains in the worker, which performs detection, header parsing, indexing, mapping, and one requested decode batch. The main thread supplies the existing `SegyWriter` a virtual header source and requests the next batch only after writing the previous one. It owns the output sink, browser download, application state, and opening the result. Worker responses are discriminated by job ID; late responses are ignored and cancellation terminates the job rather than being reported as a conversion failure.

`ui/dialogs` compose services rather than duplicating formatting/rendering. `GeometryMapPanel` keeps hover and gestures local, and commits only selected trace IDs to `AppController`. Playwright runs against a Vite development server locally and `vite preview` in production mode; the CI E2E job depends on the Node 24 verification job.
