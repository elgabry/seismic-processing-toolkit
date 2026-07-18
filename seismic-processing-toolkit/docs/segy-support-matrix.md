# SEG-Y support matrix

| Area | Status | Notes |
|---|---|---|
| Revisions | rev 0, 1, 2 standard metadata | Rev-2 standard trace-header extension count is indexed. Full rev-2 extended binary/trace-field interpretation is a known limitation. |
| Text headers | ASCII, deterministic EBCDIC, extended | Raw bytes preserved; editable 40-card standard headers. |
| Endianness | Big and non-standard little | Scored automatically or explicitly overridden. |
| Sample formats | 1,2,3,5,6,7,8,9,10,11,12,15,16 | Format 4 explicitly rejected: standard metadata cannot safely decode it. |
| Trace lengths | variable, per-trace override, rev-2 header extensions | Index windows are bounded (64 KiB by default) and do not decode samples. |
| Writer | streaming subset, byte-identical no-edit copy, explicit trace-header edits, IEEE processed output | Format and byte-order changes decode then re-encode samples. Values exceeding standard 16-bit trace sample fields are rejected. |
| SEG-D | legacy compatibility adapter | SmartSolo 8058 migration is tracked in migration notes. |

All entries above are implemented in source. Final runtime verification still requires the complete local npm gate and representative browser fixtures.
# Phase 2 conversion and export scope

| Area | Supported scope | Limitation |
|---|---|---|
| SmartSolo SEG-D | 8058 big-endian IEEE Float32, rev 1.0/2.1, SG/RG/CG legacy layout | no broad SEG-D/vendor support; unknown fields are not inferred |
| Geometry | raw/scaled SEG-Y header coordinates and offline local map | no CRS inference, remote tiles, or reprojection |
| CSV | header, samples, geometry, gather order | wide samples have configured safety caps |
| PNG | deterministic local plot/map render at requested dimensions | requests beyond pixel limits are rejected |
