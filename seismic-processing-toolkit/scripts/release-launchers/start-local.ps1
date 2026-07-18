$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
try { $version = node --version } catch { Write-Error "Node.js 22.12.0 or newer is required. Install Node 24 LTS, then run this launcher again."; exit 1 }
if ($version -notmatch '^v(\d+)\.(\d+)\.(\d+)$') { Write-Error "Could not determine the Node.js version."; exit 1 }
if (([int]$Matches[1] -lt 22) -or (([int]$Matches[1] -eq 22) -and ([int]$Matches[2] -lt 12))) { Write-Error "Node.js $version is too old. Node.js 22.12.0 or newer is required (Node 24 LTS recommended)."; exit 1 }
& node (Join-Path $root "server/serve-local.mjs") --root (Join-Path $root "app") --open @args
exit $LASTEXITCODE
