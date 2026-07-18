# Seismic Processing Toolkit

Local-first browser tools for SEG-Y reflection/refraction analysis. No runtime code uploads seismic data or calls a processing service.

## Local quick start

Use Node.js 22.12.0 or newer (Node 24 LTS recommended) and npm 10 or newer.

```bash
cd seismic-processing-toolkit
npm ci
npm run local
```

`npm run local` builds the production application and serves it at a loopback URL such as `http://127.0.0.1:4173`; it opens the default browser when possible. Use `npm run local:no-open` on headless systems, or `npm run local:serve` to serve an already-built `dist/` directory. The server is static: selected SEG-Y/SEG-D files remain in the browser and are never uploaded to it.

For development, use `npm run dev`. For a portable directory that needs Node.js but no npm, source tree, or `node_modules`, run `npm run package:local`; see [local installation](docs/local-installation.md), [local releases](docs/local-release.md), and [troubleshooting](docs/local-troubleshooting.md).

Do not double-click `index.html` with `file://`: ES modules and module workers require an HTTP origin.

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
npm run doctor
npm run local
npm run local:serve
npm run package:local
npm run test:local-server
npm run test:e2e:local-release
```

`npm ci` requires the committed `package-lock.json`; use `npm install` only when intentionally updating dependencies and commit the resulting lockfile. `npm run doctor` checks the runtime, installed dependencies, build state, and loopback port without changing anything. `npm run build` produces static files in `dist/`, suitable for an ordinary static web server. Supported browsers are current Chromium, Firefox, and Safari releases with ES2022, `Blob.slice`, typed arrays, and module workers.

Open SEG-Y files with the toolbar. Multi-gigabyte inputs are indexed by bounded Blob slices; samples decode only when they are drawn, inspected, processed, or exported. The **Legacy viewer** button opens the preserved v2.2 compatibility viewer for workflows not yet surfaced by the modular UI.

Current core support includes SEG-Y rev 0/1/2 metadata, ASCII/EBCDIC textual headers, non-standard little endian files, extended textual headers, variable trace sample counts, formats 1/2/3/5/6/7/8/9/10/11/12/15/16, streaming subset export, generated/extracted/CSV/WAV/SEG-Y pilots, TAR listing, direct/FFT correlation, gain, filtering, resampling, basic noise tools, gathers, and deconvolution APIs.

### FDSD sweep deconvolution

Open the uncorrelated SEG-Y first, then choose **FDSD deconvolution**. Select a local pilot sweep in CSV/text, WAV, SEG-Y, or TAR form, confirm the displayed sample interval, choose a water level and optional passband, then run FDSD. For CSV/text, use two columns (`timeSeconds,amplitude`) whenever the interval is not 1 ms. FDSD uses stabilized complex spectral division, `X(f)S*(f) / (|S(f)|² + ε)`, to remove the pilot rather than form the Klauder wavelet produced by cross-correlation. The sweep interval must match the SEG-Y trace interval; resample it before loading if it differs. The output opens alongside the original and no sweep or seismic data is uploaded.

The modular SmartSolo reader supports the exact legacy-verified SEG-D 8058 Float32 layout (revisions 1.0 and 2.1), not arbitrary SEG-D. The toolbar exposes local SmartSolo conversion, an offline geometry/QC map, configurable CSV export, and requested-size PNG export. SmartSolo detection/indexing/decoding/mapping run in a module worker; the main thread retains output-sink and dialog ownership. See [SmartSolo support](docs/smartsolo-8058-support.md), [geometry/QC](docs/geometry-and-coordinate-qc.md), [export workflows](docs/export-workflows.md), [browser testing](docs/browser-testing.md), and [worker pipeline](docs/smartsolo-worker-pipeline.md).

## Verification status

The repository contains focused unit/integration tests and Playwright browser workflows. The Chromium primary workflow covers local SEG-Y loading, map interaction, downloads, SmartSolo worker conversion, structured unsupported-format errors, and privacy request monitoring. `@smoke` runs in Chromium, Firefox, and WebKit. Browser reports, downloaded outputs, and installed browsers are generated artifacts and are not committed.

Known limitations are listed in [docs/segy-support-matrix.md](docs/segy-support-matrix.md) and [docs/migration-notes.md](docs/migration-notes.md).
