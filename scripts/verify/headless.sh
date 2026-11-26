#!/usr/bin/env bash
# Isolated headless acceptance: mock LLM + throwaway DSH_HOME + taskline profile.
# Requirements: dsh CLI, node, pnpm, zstd, and the DSH source checkout (mock LLM).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DSH_REPO="${DSH_REPO:-$ROOT/../deepseek-harness}"
VERIFY_HOME="${TASKLINE_VERIFY_HOME:-${TMPDIR:-/tmp}/taskline-verify-home}"
PROFILE="taskline-verify"
PORT="${TASKLINE_VERIFY_PORT:-9123}"
PASS=0; FAIL=0
say() { printf '%s\n' "$*"; }
ok() { PASS=$((PASS+1)); say "ok   $*"; }
bad() { FAIL=$((FAIL+1)); say "FAIL $*"; }

command -v dsh >/dev/null || { say "dsh CLI is required"; exit 2; }
[ -f "$DSH_REPO/packages/test-support/llm-mock-server/src/bin.ts" ] || { say "DSH_REPO must point at the deepseek-harness checkout (got $DSH_REPO)"; exit 2; }

cleanup() {
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true
}
trap cleanup EXIT

rm -rf "$VERIFY_HOME"; mkdir -p "$VERIFY_HOME"
export DSH_HOME="$VERIFY_HOME"
dsh plugin --profile "$PROFILE" add file:"$ROOT/packages/dsh-taskline" >/dev/null
# The profile starts as base + our bundle; add the headless app layer.
PROFILE_PKG="$VERIFY_HOME/profiles/$PROFILE/package.json"
python3 - "$PROFILE_PKG" <<'PY2'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
bundles = data["dsh"]["profile"]["bundles"]
if "@deepseek-ai/dsh-headless" not in bundles:
    bundles.insert(1, "@deepseek-ai/dsh-headless")
json.dump(data, open(path, "w"), indent=2, ensure_ascii=False)
PY2
# Headless verifies the task model; bili is covered by the real-web script.
cat > "$VERIFY_HOME/profiles/$PROFILE/cordis.patch.yml" <<'YAML'
- id: bili-native
  disabled: true
- id: bili-compaction-gate
  disabled: true
YAML
ok "isolated profile installed at $VERIFY_HOME"

start_mock() { # tool args sequence
  ( cd "$DSH_REPO" && exec node --import tsx packages/test-support/llm-mock-server/src/bin.ts \
      --port "$PORT" --api-key mock-key --sequence "$3" --tool-name "$1" --tool-arguments "$2" \
      >"$VERIFY_HOME/mock.log" 2>&1 ) &
  MOCK_PID=$!
  for _ in $(seq 1 120); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && return 0; sleep 0.1; done
  say "mock did not start"; return 1
}
stop_mock() { [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true; MOCK_PID=; }
run_dsh() { # sessionId | empty
  local sid="$1"; shift
  local args=(--profile "$PROFILE")
  [ -n "$sid" ] && args+=(--session-id "$sid")
  ( cd "$VERIFY_HOME" && DEEPSEEK_BASE_URL="http://127.0.0.1:$PORT/v1" DEEPSEEK_API_KEY=mock-key \
      dsh "${args[@]}" "taskline verify" >"$VERIFY_HOME/dsh.log" 2>&1 )
}
session_file() { find "$DSH_HOME/sessions" -path "*$1*" -name '*.jsonl.zstd' | head -1; }
events_json() { zstd -dc "$1" | python3 -c '
import json,sys
out=[]
for line in sys.stdin:
    try: e=json.loads(line)
    except: continue
    if e.get("type")=="plugin:taskline/event": out.append(e["data"])
print(json.dumps(out,ensure_ascii=False))
'; }

WORK="$VERIFY_HOME/work"; mkdir -p "$WORK"
start_mock task_start '{"title":"verify task"}' 'tool_call_success,success,success'
run_dsh ""
SID=$(basename "$(ls -td "$DSH_HOME"/sessions/*/*/ | head -1)")
stop_mock
F=$(session_file "$SID")
OPS=$(events_json "$F")
[[ "$OPS" == *'"op": "create"'* || "$OPS" == *'"op":"create"'* ]] && ok "task_start wrote create" || bad "task_start record missing: $OPS"

start_mock task_complete '{"taskId":"t-1"}' 'tool_call_success,success,success'
run_dsh "$SID"
stop_mock
OPS=$(events_json "$F")
[[ "$OPS" == *'"op": "complete"'* || "$OPS" == *'"op":"complete"'* ]] && ok "task_complete wrote complete" || bad "complete record missing"

start_mock task_status '{}' 'tool_call_success,success,success'
run_dsh "$SID"
stop_mock
if zstd -dc "$F" | grep -q 'verify task'; then ok "resume status rebuilt the tree"; else bad "status did not rebuild the tree"; fi

# Nesting is off by default: a child start under an open root must be rejected readably.
start_mock task_start '{"title":"nest root"}' 'tool_call_success,success,success'
run_dsh ""
NSID=$(basename "$(ls -td "$DSH_HOME"/sessions/*/*/ | head -1)")
stop_mock
start_mock task_start '{"title":"nest child","parentTaskId":"t-1"}' 'tool_call_success,success,success'
run_dsh "$NSID"
stop_mock
NF=$(session_file "$NSID")
if zstd -dc "$NF" | grep -q 'nesting is disabled'; then ok "maxDepth=0 rejects child creation"; else bad "nesting rejection missing"; fi

# Auto-create: three read calls without an open task create a root task.
AUTO_SID_WORK="$VERIFY_HOME/autocreate"; mkdir -p "$AUTO_SID_WORK"; printf 'x\n' > "$AUTO_SID_WORK/file.txt"
start_mock read '{"file_path":"'"$AUTO_SID_WORK"'/file.txt"}' 'tool_call_success,tool_call_success,tool_call_success,tool_call_success,success,success'
( cd "$AUTO_SID_WORK" && DEEPSEEK_BASE_URL="http://127.0.0.1:$PORT/v1" DEEPSEEK_API_KEY=mock-key \
    dsh --profile "$PROFILE" "read the file" >"$VERIFY_HOME/dsh-auto.log" 2>&1 )
stop_mock
AUTO_F=$(find "$DSH_HOME/sessions" -path '*autocreate*' -name '*.jsonl.zstd' | head -1)
if [ -n "$AUTO_F" ] && zstd -dc "$AUTO_F" | grep -q '"autoCreated": true\|"autoCreated":true'; then ok "auto-create threshold wrote autoCreated task"; else bad "auto-create task missing"; fi

# Uninstall keeps the session readable; reinstall rebuilds the tree.
dsh plugin --profile "$PROFILE" remove dsh-taskline dsh-taskline-core dsh-taskline-ui dsh-taskline-compactor dsh-taskline-bili dsh-taskline-bili-adapter >/dev/null
[ -f "$F" ] && zstd -dc "$F" >/dev/null && ok "session readable after uninstall" || bad "session unreadable after uninstall"
dsh plugin --profile "$PROFILE" add file:"$ROOT/packages/dsh-taskline" >/dev/null
ok "reinstall completed"

say "----"
say "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
