# Portable local release

`npm run package:local` first builds the production application, then creates `local-release/seismic-processing-toolkit/`.

```text
seismic-processing-toolkit/
├── app/                 built Vite assets and legacy compatibility viewer
├── server/serve-local.mjs
├── start-local.cmd
├── start-local.ps1
├── start-local.sh
├── README_LOCAL.md
├── VERSION
├── BUILD.json
└── SHA256SUMS
```

`app/` contains the relative-base production build, including the SmartSolo module-worker chunk and `legacy/segy-wiggle-viewer-v2.2.html`. The package intentionally excludes `node_modules`, TypeScript source, tests, reports, coverage, and source maps. Its server uses only Node built-in modules, binds to loopback by default, supports GET/HEAD and `/healthz`, serves module JavaScript with the correct MIME type, blocks traversal, and does not list directories.

The launchers find the package root relative to themselves and call `node server/serve-local.mjs --root app --open`. They do not invoke npm or download anything. Node 22.12+ is required; Node 24 LTS is recommended.

`BUILD.json` records the application version, available Git commit, package channel, packaging Node version, emitted main and worker bundle names, and source-map state. It deliberately omits a timestamp so package metadata is less variable. `SHA256SUMS` hashes every packaged runtime file except the checksum manifest itself. On Unix, use `sha256sum -c SHA256SUMS` where available; on PowerShell, compare `Get-FileHash` results with the manifest.

The optional `--cross-origin-isolated` server mode sets COOP/COEP headers. It is not the default; automated packaged-release smoke coverage verifies the application, SmartSolo worker, CSV, and PNG paths with isolation enabled.
