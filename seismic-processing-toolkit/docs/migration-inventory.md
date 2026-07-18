# Migration inventory

| Existing feature | Legacy code location | Target modular code | Migration status | Test coverage | Intentional change |
|---|---|---|---|---|---|
| SEG-Y parse / endian / text | `parseFile`, `detectText`, `decodeText` | `io/segy` | implemented | reader/codec integration | implausible headers warn instead of assuming IEEE |
| SmartSolo format detection | `segdLooks` | `io/segd/smartsolo8058/smartsolo8058-detector.ts` | implemented for 0x8058 rev 1.0/2.1 | detection fixture | extension alone never classifies a file |
| SmartSolo header parsing | `convertSegd` GH/XH/EH offsets | `smartsolo8058-headers.ts` | implemented for fields consumed by legacy conversion | integration fixture | raw prefix is retained; unknown vendor fields are not guessed |
| SmartSolo trace indexing | `convertSegd` trace walk | `smartsolo8058-trace-index.ts` | implemented | bounded-read/truncation tests | lazy 64 KiB windows replace full-file walk |
| SmartSolo sample decoding | `convertSegd` IEEE loop | `smartsolo8058-trace-accessor.ts` | implemented | known Float32 values | non-finite values are diagnosed and preserved |
| SmartSolo metadata mapping | `convertSegd` SEG-Y header writes | `smartsolo8058-mapping.ts` | implemented | conversion reopen test | RG source/receiver reversal remains explicit |
| SmartSolo auxiliary handling | no documented legacy field | trace-class columns/options | intentionally uncertain | diagnostic coverage | traces stay `unknown`, never guessed auxiliary/pilot |
| SmartSolo conversion UI | legacy open path | `ui/dialogs/smartsolo-conversion-dialog.ts` | implemented | build/typecheck | Blob fallback downloads and reopens converted SEG-Y |
| SmartSolo conversion worker | none | no worker yet | deferred | n/a | bounded streaming prevents whole-file allocation; worker requires browser performance evidence |
| Map rendering | `coordSet`, `drawMap` | `geometry`, `visualization/map`, `GeometryMapPanel` | implemented offline | transform/QC tests | no remote tiles or reprojection |
| Coordinate QC | implicit legacy coordinate helpers | `geometry/geometry-qc-analyzer.ts` | implemented | geometry tests | unknown units produce uncertainty, not metre claims |
| PNG export | `cv.toBlob`, `mc.toBlob` | `export/png` | implemented | dimension validation | fresh requested-size render, never a DOM screenshot |
| Trace-sample CSV | `btnCsvTr` | `export/csv/trace-sample-csv-exporter.ts` | implemented | CSV encoder tests | long default; wide mode is capped |
| Trace-header CSV | `btnCsvHdr` | `export/csv/trace-header-csv-exporter.ts` | implemented | CSV encoder tests | raw and scaled coordinates can both be emitted |
| Geometry CSV | no direct legacy equivalent | `export/csv/geometry-csv-exporter.ts` | implemented | CSV encoder tests | includes unit/scalar and QC flag columns |
| Gather CSV | gather UI state | `export/csv/gather-csv-exporter.ts` | implemented | CSV encoder tests | exports trace order only, never duplicate samples |
