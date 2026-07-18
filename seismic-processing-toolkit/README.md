# Seismic Processing Toolkit

Local-first browser tools for SEG-Y reflection/refraction analysis. No runtime code uploads seismic data or calls a processing service.

## Commands

```bash
npm ci
npm run dev
npm run typecheck
npm run test
npm run lint
npm run build
npm run benchmark
npm run test:e2e
npm run test:e2e:prod
```

Use Node.js 22.12+ (CI uses Node 24) for the locked toolchain. `npm ci` requires the committed `package-lock.json`; use `npm install` only when intentionally updating dependencies and commit the resulting lockfile. `npm run build` produces static files in `dist/`, suitable for an ordinary static web server. Supported browsers are current Chromium, Firefox, and Safari releases with ES2022, `Blob.slice`, typed arrays, and module workers.

Open SEG-Y files with the toolbar. Multi-gigabyte inputs are indexed by bounded Blob slices; samples decode only when they are drawn, inspected, processed, or exported. The **Legacy viewer** button opens the preserved v2.2 compatibility viewer for workflows not yet surfaced by the modular UI.

Current core support includes SEG-Y rev 0/1/2 metadata, ASCII/EBCDIC textual headers, non-standard little endian files, extended textual headers, variable trace sample counts, formats 1/2/3/5/6/7/8/9/10/11/12/15/16, streaming subset export, generated/extracted/CSV/WAV/SEG-Y pilots, TAR listing, direct/FFT correlation, gain, filtering, resampling, basic noise tools, gathers, and deconvolution APIs.

The modular SmartSolo reader supports the exact legacy-verified SEG-D 8058 Float32 layout (revisions 1.0 and 2.1), not arbitrary SEG-D. The toolbar exposes local SmartSolo conversion, an offline geometry/QC map, configurable CSV export, and requested-size PNG export. SmartSolo detection/indexing/decoding/mapping run in a module worker; the main thread retains output-sink and dialog ownership. See [SmartSolo support](docs/smartsolo-8058-support.md), [geometry/QC](docs/geometry-and-coordinate-qc.md), [export workflows](docs/export-workflows.md), [browser testing](docs/browser-testing.md), and [worker pipeline](docs/smartsolo-worker-pipeline.md).

## Verification status

The repository contains focused unit/integration tests and Playwright browser workflows. The Chromium primary workflow covers local SEG-Y loading, map interaction, downloads, SmartSolo worker conversion, structured unsupported-format errors, and privacy request monitoring. `@smoke` runs in Chromium, Firefox, and WebKit. Browser reports, downloaded outputs, and installed browsers are generated artifacts and are not committed.

Known limitations are listed in [docs/segy-support-matrix.md](docs/segy-support-matrix.md) and [docs/migration-notes.md](docs/migration-notes.md).
