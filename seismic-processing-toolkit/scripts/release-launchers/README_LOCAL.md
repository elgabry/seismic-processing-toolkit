# Seismic Processing Toolkit — local release

This package runs entirely on your computer. It needs Node.js 22.12.0 or newer (Node 24 LTS recommended), but it does **not** need npm, `node_modules`, or an internet connection after extraction.

- Windows: double-click `start-local.cmd`.
- PowerShell: run `./start-local.ps1`.
- macOS/Linux: run `chmod +x start-local.sh` once, then `./start-local.sh`.

The server binds to `127.0.0.1:4173` by default and prints the actual URL. Pass `--no-open`, `--port 4180`, or `--strict-port` to a launcher when needed. Press Ctrl+C in the server terminal to stop it.

Do not open `app/index.html` with `file://`: browser ES-module and worker security requires a local HTTP origin. The local server only serves application files; SEG-Y and SEG-D selections stay in the browser and are not uploaded to it.

`VERSION`, `BUILD.json`, and `SHA256SUMS` describe this package. On macOS/Linux run `sha256sum -c SHA256SUMS` when available; on PowerShell use `Get-FileHash` to compare individual files.
