#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE_VERSION=$(node --version 2>/dev/null || true)
if [ -z "$NODE_VERSION" ]; then
  echo "Node.js 22.12.0 or newer is required. Install Node 24 LTS, then run this launcher again." >&2
  exit 1
fi
NODE_MAJOR=$(printf '%s' "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)
NODE_MINOR=$(printf '%s' "$NODE_VERSION" | sed 's/^v//' | cut -d. -f2)
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 12 ]; }; then
  echo "Node.js $NODE_VERSION is too old. Node.js 22.12.0 or newer is required (Node 24 LTS recommended)." >&2
  exit 1
fi
exec node "$SCRIPT_DIR/server/serve-local.mjs" --root "$SCRIPT_DIR/app" --open "$@"
