# Local troubleshooting

## Runtime and launch

- **`node` is not found or is too old:** install Node 24 LTS (minimum 22.12.0), reopen the terminal, and rerun the launcher. Source mode also requires npm 10+.
- **PowerShell blocks the launcher:** follow your organization’s execution-policy guidance or invoke the script from an approved PowerShell session. Do not run elevated unless your organization requires it.
- **Port in use:** the server normally selects the next loopback port and prints it. Choose one explicitly with `--port 4180`, or use `--strict-port` to fail instead.
- **Browser does not open:** copy the printed `http://127.0.0.1:…` URL into a browser, or pass `--no-open` on headless systems.
- **Stop the server:** press Ctrl+C in the terminal that started it.

## Browser and files

- **Blank page or worker failed to load:** use the printed HTTP URL, not `file://`; refresh after rebuilding, then inspect the local-server terminal output. Clear stale browser cache if an old release was replaced in the same directory.
- **File chooser or download blocked:** use a current Chromium/Edge browser where possible and allow the user-initiated download prompt. Browser security settings must not be disabled globally.
- **Large Blob warning:** use the File System Access API where available or reduce the selected export; the browser fallback is deliberately size-limited.
- **Path contains spaces:** source and release launchers resolve their own paths and quote arguments. If a network-mounted directory behaves differently, copy the release to a local directory first.

## Network and privacy

The application listens on `127.0.0.1` by default. Check the printed URL or `/healthz` to confirm it. Antivirus/firewall prompts should not require exposing the server to a LAN; decline LAN/public-network access unless you explicitly selected a non-loopback host. The server never receives selected seismic files and does not proxy or upload them.

## Diagnostics

Run `npm run doctor` from a source checkout for a no-change runtime check. Run `npm run test:local-server` to validate the static-server implementation. The release includes `VERSION`, `BUILD.json`, and `SHA256SUMS` to identify and verify a copied bundle.
