# Export workflows

CSV export uses an incremental RFC-4180 encoder over `OutputSink`. Values with delimiters, quotes, CR, or LF are quoted; quotes are doubled; empty and non-finite numeric values are emitted as empty fields. Output uses deterministic columns and locale-independent numbers.

Available modes are trace-header CSV (including raw/scaled coordinate columns), long trace-sample CSV, capped wide trace-sample CSV, geometry CSV, and gather-order CSV. Wide CSV rejects unsafe column/cell counts. Exporters close a successful sink and abort it on failure or cancellation, so they do not construct a multi-gigabyte string.

The CSV dialog selects headers, samples, geometry, or gather order; scopes are selected trace, visible traces, range, or entire dataset. It exposes long/wide layout, comma/tab, LF/CRLF, precision, header row, and scaled-coordinate choices. Geometry and gather modes reuse the streaming services. Blob fallback warns implicitly through its 512 MiB safety limit; a File System Access destination remains a future dialog enhancement.

PNG export renders a fresh canvas at requested dimensions. Plot and map exporters use immutable render state and never alter the active viewport. Transparent/opaque backgrounds are supported. Requests above the validated pixel limit fail before canvas allocation instead of producing clipped images. `OffscreenCanvas` is used when available; a normal Canvas fallback remains local to the browser.

The PNG dialog offers wiggle, variable-area, density, and geometry-map targets, dimensions/presets (1600×1000, 1920×1080, 2560×1440), transparent or opaque background, title, current viewport/visible traces, and legend toggles. It validates the requested allocation before rendering. Before/after/difference targets and asynchronous PNG cancellation remain future UI work.
