#!/usr/bin/env bash
# Real web acceptance (no headless CLI): isolated profile + full bili + dsh web + browser.
# Requires: dsh CLI, pnpm, zstd, Google Chrome, and model credentials for real turns.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_HOME="${TASKLINE_WEB_HOME:-${TMPDIR:-/tmp}/taskline-web-home}"
PROFILE="taskline-web"
PORT="${TASKLINE_WEB_PORT:-9130}"
URL_FILE="$WEB_HOME/web-url.txt"

rm -rf "$WEB_HOME"; mkdir -p "$WEB_HOME"
export DSH_HOME="$WEB_HOME"

dsh plugin --profile "$PROFILE" add file:"$ROOT/packages/dsh-taskline" >/dev/null

PROFILE_PKG="$WEB_HOME/profiles/$PROFILE/package.json"
python3 - "$PROFILE_PKG" <<'PY2'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
bundles = data["dsh"]["profile"]["bundles"]
if "@deepseek-ai/dsh-web-app" not in bundles:
    bundles.insert(1, "@deepseek-ai/dsh-web-app")
json.dump(data, open(path, "w"), indent=2, ensure_ascii=False)
PY2

if [ -n "${MINIMAX_CN_API_KEY:-}" ]; then
python3 - "$WEB_HOME/profiles/$PROFILE/cordis.patch.yml" <<'PY3'
import sys, yaml
patch = [
  {'id': 'llm-pi-ai', 'config': {'providers': {'minimax-cn': {'apiKeyEnv': 'MINIMAX_CN_API_KEY', 'models': [{'id': 'MiniMax-M3.1-Flash', 'name': 'MiniMax-M3.1-Flash', 'contextWindow': 1000000, 'maxTokens': 128000, 'input': ['text', 'image'], 'reasoningEfforts': {'off': None, 'high': 'high', 'max': 'max'}}]}}}},
  {'id': 'agent-default-model', 'config': {'provider': 'minimax-cn', 'model': 'MiniMax-M3.1-Flash', 'reasoningEffort': 'max'}},
]
open(sys.argv[1], 'w').write(yaml.safe_dump(patch, sort_keys=False, allow_unicode=True))
PY3
fi

( dsh --profile "$PROFILE" --port "$PORT" --host 127.0.0.1 --no-open >"$WEB_HOME/web.log" 2>&1 ) &
WEB_PID=$!
trap 'kill "$WEB_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 200); do
  URL=$(grep -o 'http://127.0.0.1:[0-9]*/?token=[A-Za-z0-9_-]*' "$WEB_HOME/web.log" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 0.2
done
[ -n "${URL:-}" ] || { echo "web did not start"; tail -20 "$WEB_HOME/web.log"; exit 1; }
echo "$URL" > "$URL_FILE"
echo "web: $URL"
if [ -n "${MINIMAX_CN_API_KEY:-}" ]; then
  DSH_HOME="$WEB_HOME" node "$ROOT/scripts/verify/real-web.mjs" "$URL" --screenshot-dir "$WEB_HOME"
  F=$(ls -t "$WEB_HOME"/sessions/*/*/session.v4.jsonl.zstd | head -1)
  zstd -dc "$F" | python3 -c '
import json, sys
calls = []; compaction = []; failed = False
for line in sys.stdin:
    try: event = json.loads(line)
    except Exception: continue
    kind = event.get("type")
    if kind == "tool/call": calls.append(event["data"].get("name"))
    elif kind in ("compaction/start", "compaction/end"): compaction.append(kind)
    elif kind == "turn/end" and (event["data"].get("reason") or {}).get("kind") == "error": failed = True
assert "task_start" in calls, calls
assert "task_complete" in calls, calls
assert "task_compress" in calls, calls
assert compaction.count("compaction/start") >= 1 and compaction.count("compaction/end") >= 1, compaction
assert not failed, "a turn ended with an error"
print("session verified:", calls, compaction)
'
  kill "$WEB_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  ( dsh --profile "$PROFILE" --port "$PORT" --host 127.0.0.1 --no-open >"$WEB_HOME/web-restart.log" 2>&1 ) &
  WEB_PID=$!
  for _ in $(seq 1 200); do
    URL2=$(grep -o 'http://127.0.0.1:[0-9]*/?token=[A-Za-z0-9_-]*' "$WEB_HOME/web-restart.log" | head -1 || true)
    [ -n "$URL2" ] && break
    sleep 0.2
  done
  DSH_HOME="$WEB_HOME" node "$ROOT/scripts/verify/load-history.mjs" "$URL2"
else
  echo "MINIMAX_CN_API_KEY not set; skipping real conversation (plugin page check only)"
  DSH_HOME="$WEB_HOME" node "$ROOT/scripts/verify/browser.mjs" "$URL"
fi
