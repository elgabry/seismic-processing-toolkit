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

## Phase 3 implementation matrix

| Item | Current state | Target module | Tests | Completion / remaining limitation |
|---|---|---|---|---|
| Playwright infrastructure | new local dependency/config | `playwright.config.ts` | production E2E CI | implemented; engines install in CI |
| SEG-Y browser fixture loading | synthetic upload payload | `tests/e2e/fixtures/seismic-fixtures.ts` | shell/viewer specs | implemented |
| SmartSolo browser fixture loading | synthetic 8058 payload | `tests/e2e/fixtures/seismic-fixtures.ts` | conversion spec | implemented for rev 1.0 fixture only |
| Download testing | CSV/PNG parser helpers | `tests/e2e/fixtures/downloads.ts` | smoke spec | implemented for header CSV and PNG |
| Console-error monitoring | page/console collector | `browser-errors.ts` | all E2E specs | implemented |
| Network privacy checks | request recorder | `privacy.spec.ts` | Chromium primary | implemented; static GETs only allowed |
| SmartSolo worker detection | module worker `open` | `workers/smartsolo.worker.ts` | protocol/unit + E2E | implemented |
| SmartSolo worker indexing | bounded worker `open` | `workers/smartsolo.worker.ts` | E2E/build | implemented |
| SmartSolo worker decoding | pull batch request | `workers/smartsolo.worker.ts` | protocol/unit + E2E | implemented |
| SmartSolo conversion cancellation | shared Abort/job cancel | worker client/dialog | protocol + indexing-cancel browser test | implemented; deterministic mid-conversion browser race fixture remains future work |
| SmartSolo conversion progress | phase messages | worker protocol/dialog | browser workflow | implemented |
| Map fit/reset | toolbar controls | `GeometryMapPanel` | transform/unit + E2E | implemented |
| Map layer controls | source/receiver/CMP toggles | `GeometryMapPanel` | browser map spec | implemented |
| Box zoom / multi-selection | gesture modes + grid query | map transforms/index/panel | unit primitives | implemented; high-density visual stress remains future work |
| Hover inspection | local hover text | `GeometryMapPanel` | browser map spec | implemented |
| Color-by-header / legend | role/offset/ID scale | map renderer/panel | unit render prep | implemented; custom arbitrary headers remain future work |
| Geometry CSV dialog | streaming service controls | `CsvExportDialog` | service/unit + E2E smoke | implemented |
| Gather CSV dialog | gather-index option | `CsvExportDialog` | service/unit | implemented |
| Long/wide trace CSV options | dialog layout selector | `CsvExportDialog` | exporter limits | implemented; wide rejects unsafe scope |
| PNG options dialog | target/dimension/background controls | `PngExportDialog` | PNG unit + E2E smoke | implemented; comparison/difference remain future work |
| Production-preview E2E | Vite preview web server | Playwright config | CI E2E job | implemented |
| Cross-browser smoke | Chromium/Firefox/WebKit projects | Playwright config | `@smoke` | implemented; structural rather than pixel-equivalence assertions |

## Publication section implementation matrix

| Item | Target module | Tests | Completion / limitation |
|---|---|---|---|
| Serializable section options and reference preset | `visualization/section/section-render-model.ts` | unit | implemented; render options are display-only |
| Symmetric grayscale mapping and bounded statistics | `section-color-mapper.ts` | unit | implemented; 4096-bin deterministic histogram |
| Portrait layout, time/receiver axes, title and frame | `section-layout.ts`, `section-axis-renderer.ts` | unit | implemented; browser fonts may vary slightly |
| Density raster and vertical antialiasing | `seismic-amplitude-rasterizer.ts` | unit/browser PNG | implemented; no field-data visual baseline is committed |
| Publication PNG adapter | `export/png/publication-section-export.ts` | browser PNG | implemented; fresh canvas, never a screenshot |
| Export dialog and preview | `ui/dialogs/png-export-dialog.ts` | Chromium workflow | implemented; current modular UI has no separate processing-graph result selector |
