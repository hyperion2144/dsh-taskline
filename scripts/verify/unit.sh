#!/usr/bin/env bash
# Run every pure unit suite in this repository.
set -euo pipefail
cd "$(dirname "$0")/../.."
node --test packages/dsh-taskline-core/test/*.test.js \
  packages/dsh-taskline-compactor/test/*.test.js \
  packages/dsh-taskline-bili/test/*.test.js \
  packages/dsh-taskline-bili-adapter/test/*.test.js
