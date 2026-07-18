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
```

Use Node.js 22.12+ (CI uses Node 24) for the locked toolchain. `npm ci` requires the committed `package-lock.json`; use `npm install` only when intentionally updating dependencies and commit the resulting lockfile. `npm run build` produces static files in `dist/`, suitable for an ordinary static web server. Supported browsers are current Chromium, Firefox, and Safari releases with ES2022, `Blob.slice`, typed arrays, and module workers.

Open SEG-Y files with the toolbar. Multi-gigabyte inputs are indexed by bounded Blob slices; samples decode only when they are drawn, inspected, processed, or exported. The **Legacy viewer** button opens the preserved v2.2 compatibility viewer for workflows not yet surfaced by the modular UI.

Current core support includes SEG-Y rev 0/1/2 metadata, ASCII/EBCDIC textual headers, non-standard little endian files, extended textual headers, variable trace sample counts, formats 1/2/3/5/6/7/8/9/10/11/12/15/16, streaming subset export, generated/extracted/CSV/WAV/SEG-Y pilots, TAR listing, direct/FFT correlation, gain, filtering, resampling, basic noise tools, gathers, and deconvolution APIs.

The modular SmartSolo reader supports the exact legacy-verified SEG-D 8058 Float32 layout (revisions 1.0 and 2.1), not arbitrary SEG-D. The toolbar exposes local SmartSolo conversion, an offline geometry/QC map, header/trace CSV export, and requested-size plot PNG export. See [SmartSolo support](docs/smartsolo-8058-support.md), [geometry/QC](docs/geometry-and-coordinate-qc.md), and [export workflows](docs/export-workflows.md).

## Verification status

The repository contains focused unit and integration tests for the priority core paths, including byte-for-byte no-edit SEG-Y export, re-encoding, bounded indexing, codecs, correlation, and basic DSP responses. They require a successful dependency install before their results can be treated as verified. Browser smoke coverage and the modular SmartSolo, map, PNG, and CSV UI workflows remain pending.

Known limitations are listed in [docs/segy-support-matrix.md](docs/segy-support-matrix.md) and [docs/migration-notes.md](docs/migration-notes.md).
