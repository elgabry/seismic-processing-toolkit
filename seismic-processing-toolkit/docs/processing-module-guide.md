# Adding a processor

Implement `SeismicProcessor<P>` with a stable ID/version, metadata validation, a resource estimate, and bounded `processBlock` implementation. Register it once in `ProcessorRegistry`; add its serializable parameters to a `ProcessingGraphNode`; keep DOM code in `ui`/`app` only.

Time inputs arriving from UI in milliseconds must be converted once to seconds before calling a processor. Tests must cover parameter validation, a deterministic synthetic block, cancellation/progress behaviour when applicable, and a resource estimate appropriate to the algorithm.
