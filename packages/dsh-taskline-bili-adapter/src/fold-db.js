/** Read bili's own block ledger so surface write-back follows the real fold range. */
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

function sessionsDir() {
  const explicit = globalThis.process?.env?.BILI_SESSIONS_DIR
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  const xdg = globalThis.process?.env?.XDG_DATA_HOME
  const base = typeof xdg === 'string' && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share')
  return join(base, 'billion-context', 'sessions')
}

/** Active blocks for one conversation, oldest first, with their real folded ids. */
export function readBiliBlocks(sessionId) {
  let db
  try {
    db = new DatabaseSync(join(sessionsDir(), 'index.db'), { readOnly: true })
  } catch {
    return []
  }
  try {
    const rows = db.prepare('SELECT block_id, payload_json FROM blocks WHERE session_id = ? AND active = 1 ORDER BY ord').all(sessionId)
    return rows.flatMap((row) => {
      try {
        const payload = JSON.parse(row.payload_json)
        const messageIds = Array.isArray(payload.effectiveMessageIds) && payload.effectiveMessageIds.length > 0
          ? payload.effectiveMessageIds
          : Array.isArray(payload.directMessageIds) ? payload.directMessageIds : []
        return [{
          blockId: String(row.block_id),
          summary: String(payload.summary ?? ''),
          messageIds: messageIds.map(String),
          compressedTokens: Number.isFinite(payload.compressedTokens) ? payload.compressedTokens : 0,
        }]
      } catch {
        return []
      }
    })
  } catch {
    return []
  } finally {
    db.close()
  }
}
