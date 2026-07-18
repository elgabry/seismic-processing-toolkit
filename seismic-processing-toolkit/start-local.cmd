@echo off
setlocal
pushd "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.12.0 or newer is required. Install Node 24 LTS, then run this launcher again.
  exit /b 1
)
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=12)?0:1)"
if errorlevel 1 (
  echo Node.js is too old. Node.js 22.12.0 or newer is required ^(Node 24 LTS recommended^).
  exit /b 1
)
npm --version >nul 2>&1
if errorlevel 1 (
  echo npm 10 or newer is required for a source checkout.
  exit /b 1
)
npm run local -- %*
set "STATUS=%ERRORLEVEL%"
popd
exit /b %STATUS%
