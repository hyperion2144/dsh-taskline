#!/usr/bin/env bash
# Install this checkout into a DSH profile WITHOUT invoking the dsh CLI.
# Usage: scripts/install-local.sh [profile] [DSH_HOME]
set -euo pipefail
PROFILE="${1:-desktop}"
DSH_HOME="${2:-${DSH_HOME:-$HOME/.dsh}}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
[ -d "$PROFILE_DIR" ] || { echo "profile not found: $PROFILE_DIR" >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMBO="$ROOT/packages/dsh-taskline"
[ -f "$COMBO/package.json" ] || { echo "missing bundle at $COMBO" >&2; exit 1; }

# Prefer a pnpm on PATH; otherwise use the one shipped inside DSH Desktop.
PNPM="${PNPM:-}"
if [ -z "$PNPM" ]; then
  if command -v pnpm >/dev/null 2>&1; then PNPM="$(command -v pnpm)"; else
    CANDIDATE="${DSH_RESOURCES:-/Applications/DSH Desktop Plus.app/Contents/Resources}/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs"
    [ -f "$CANDIDATE" ] || { echo "pnpm not found; set PNPM=/path/to/pnpm" >&2; exit 1; }
    PNPM="node $CANDIDATE"
  fi
fi

cd "$PROFILE_DIR"
$PNPM add "file:$COMBO"
node - "$PROFILE_DIR/package.json" <<'NODE'
const fs = require('fs')
const file = process.argv[2]
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
data.dsh ??= {}
data.dsh.profile ??= {}
data.dsh.profile.bundles ??= []
if (!data.dsh.profile.bundles.includes('dsh-taskline')) data.dsh.profile.bundles.push('dsh-taskline')
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
NODE
echo "installed dsh-taskline into $PROFILE_DIR without the dsh CLI"
