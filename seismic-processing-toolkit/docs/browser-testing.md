# Browser testing

Playwright is a project-local dev dependency. Install its browser engines after `npm ci`:

```bash
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:prod
```

`test:e2e` serves the Vite application for rapid local feedback. `test:e2e:prod` builds first and tests `vite preview`; CI runs that command after the Node 24 unit/integration gate. Chromium runs the primary suite. Tests tagged `@smoke` also run in Firefox and WebKit, covering shell load, local SEG-Y selection, plot creation, CSV download, PNG download, and uncaught-page-error monitoring.

Fixtures are synthetic, generated in test code, and uploaded through Playwright file payloads. They contain no proprietary survey data. Tests capture page errors and console errors, parse download contents, start from a fresh page, and avoid arbitrary sleeps. The privacy workflow records browser requests and rejects non-GET or non-local requests during file selection. Playwright reports, traces, screenshots, test results, browser binaries, and downloaded files are generated artifacts and must not be committed.

Known scope: browser tests exercise documented fixture layouts and browser fallbacks, not every SmartSolo field-file variant, cancellation timing, canvas implementation, or export permutation. Firefox/WebKit cover critical smoke paths rather than pixel-identical rendering.

Publication-section browser coverage exports a small synthetic SEG-Y section through the same PNG render model used in production. Chromium validates the PNG signature and exact dimensions after selecting the reference-style controls; smoke coverage verifies that the export finishes without a page error. The deterministic in-repository synthetic section fixture contains dipping and hyperbolic events only; it is not seismic field data. Pixel equality is intentionally limited to a Chromium fixture because font rasterization differs across engines.
