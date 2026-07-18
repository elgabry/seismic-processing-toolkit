# Local installation

The toolkit is a static browser application. It needs an HTTP origin for ES modules and module workers, so opening `index.html` with `file://` is unsupported.

## Requirements

- Node.js 22.12.0 or newer; Node 24 LTS is recommended.
- npm 10 or newer for a source checkout only.
- A current Chrome/Edge browser provides the fullest local-file API support. Firefox and WebKit use documented browser fallbacks.

## Source checkout

```bash
cd seismic-processing-toolkit
npm ci
npm run local
```

Use `npm run dev` for Vite development. `npm run local:no-open` builds and starts the loopback server without launching a browser. `npm run local:serve` serves an already-built `dist/` directory. `npm run doctor` makes no changes and reports missing dependencies, unsupported runtimes, and the preferred-port state.

The source helpers resolve their own directory: `setup-local.sh` / `setup-local.ps1` run `npm ci`; `start-local.sh`, `start-local.ps1`, and `start-local.cmd` run `npm run local`. They work when the checkout path contains spaces.

## Portable release

Run `npm run package:local` from a checked-out source tree. The output is `local-release/seismic-processing-toolkit/`. Copy that directory anywhere, including a path with spaces. It needs Node but does not need npm, `node_modules`, the source tree, or internet access after extraction.

- Windows: `start-local.cmd`
- PowerShell: `./start-local.ps1`
- macOS/Linux: `chmod +x start-local.sh` once, then `./start-local.sh`

Append `--no-open`, `--port 4180`, or `--strict-port` to a launcher. Press Ctrl+C in the server terminal to stop it.

## Privacy and networking

The local server binds to `127.0.0.1:4173` by default and chooses the next local port on conflict unless `--strict-port` is set. It only serves built application assets and `/healthz`; it has no upload, proxy, telemetry, map-tile, or processing-service endpoint. SEG-Y/SEG-D selection, SmartSolo conversion, CSV creation, and PNG creation occur in the browser. The server warns if a non-loopback host is explicitly requested.
