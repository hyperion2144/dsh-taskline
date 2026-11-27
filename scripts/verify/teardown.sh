#!/usr/bin/env bash
# Remove verification artifacts only inside the isolated verify home.
set -euo pipefail
VERIFY_HOME="${TASKLINE_VERIFY_HOME:-${TMPDIR:-/tmp}/taskline-verify-home}"
case "$VERIFY_HOME" in
  /tmp/*|"${TMPDIR:-/tmp}"/*) ;;
  *) echo "refusing to remove non-temporary path: $VERIFY_HOME" >&2; exit 2 ;;
esac
rm -rf "$VERIFY_HOME"
echo "removed $VERIFY_HOME"
