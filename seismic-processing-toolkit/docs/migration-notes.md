# Migration notes

The original 2,288-line file is preserved byte-for-byte at `src/legacy/reference/segy-wiggle-viewer-v2.2.html` and served through `public/legacy/` as a compatibility adapter. It keeps SmartSolo SEG-D 8058 conversion, detailed map/OSM controls, PNG/CSV UI export, and its familiar mouse/keyboard workflows available while their modular replacements are expanded.

The original parser loaded entire files, assumed a fixed trace length after a one-time calculation, and silently treated unknown sample format as IEEE float. The modular reader uses Blob slices, traces each header independently, preserves raw bytes, and issues structured warnings/errors.
