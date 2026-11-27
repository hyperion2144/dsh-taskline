/**
 * Loopback client for the billion-context plugin protocol (v2).
 *
 * The proxy owns refs (`mNNNNN`); this client only speaks its HTTP endpoints.
 * Every call treats HTTP success as transport success and `outcome` as the
 * business verdict (a refusal is a 200 with outcome "refused").
 */

export const DEFAULT_ORIGIN = 'http://127.0.0.1:18787'
export const ZONE_PORT_BASE = 18787

/** Resolve the proxy origin from the environment, falling back to the default. */
export function originFromEnv(env = globalThis.process?.env ?? {}) {
  const raw = env.BILLION_CONTEXT_PROXY
  return typeof raw === 'string' && raw.length > 0 ? raw.replace(/\/$/, '') : DEFAULT_ORIGIN
}

async function jsonOrThrow(response, label) {
  const body = await response.json().catch(() => undefined)
  if (body === undefined) throw new Error(`bili ${label}: invalid JSON response`)
  return body
}

/** Find the proxy this host spawned by matching the health watchdog parent pid. */
export async function discoverOrigin({
  fetchImpl = globalThis.fetch,
  base = ZONE_PORT_BASE,
  span = 32,
  parentPid = globalThis.process?.pid,
  timeoutMs = 400,
} = {}) {
  const candidates = Array.from({ length: span }, (_, index) => base + index)
  const probes = candidates.map(async (port) => {
    const origin = `http://127.0.0.1:${port}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${origin}/__bili/health`, { signal: controller.signal })
      if (!response.ok) return undefined
      const body = await response.json()
      if (body?.ok !== true) return undefined
      const owners = [body?.watchdog?.parentPid, ...(Array.isArray(body?.watchdog?.watchers) ? body.watchdog.watchers : [])]
      if (parentPid !== undefined && owners.length > 0 && !owners.includes(parentPid)) return undefined
      return origin
    } catch {
      return undefined
    } finally {
      clearTimeout(timer)
    }
  })
  const found = await Promise.all(probes)
  return found.find((origin) => origin !== undefined) ?? DEFAULT_ORIGIN
}

/** Create a protocol client bound to one origin. */
export function createBiliClient({ origin = DEFAULT_ORIGIN, fetchImpl = globalThis.fetch } = {}) {
  const base = origin.replace(/\/$/, '')
  return {
    origin: base,
    async health() {
      const response = await fetchImpl(`${base}/__bili/health`)
      if (!response.ok) return { ok: false, status: response.status }
      const body = await jsonOrThrow(response, 'health')
      return { ok: body?.ok === true, proxy: body?.proxy, raw: body }
    },
    async status(conversationId) {
      const response = await fetchImpl(`${base}/__bili/plugin/status?conversationId=${encodeURIComponent(conversationId)}`)
      return jsonOrThrow(response, 'status')
    },
    async snapshot(conversationId) {
      const response = await fetchImpl(`${base}/__bili/plugin/snapshot?conversationId=${encodeURIComponent(conversationId)}`)
      return jsonOrThrow(response, 'snapshot')
    },
    /** Tell the proxy that the host wrote its own compaction boundary. */
    async notifyCompacted(conversationId) {
      const response = await fetchImpl(`${base}/__bili/plugin/compact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
      return jsonOrThrow(response, 'compact')
    },
    /** Forward any bili plugin tool call (decompress/search_context/acp_*). */
    async tool(conversationId, tool, args = {}) {
      const response = await fetchImpl(`${base}/__bili/plugin/tool`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, tool, nativeCaller: true, args }),
      })
      return jsonOrThrow(response, tool)
    },
    /** Submit one content string holding all ranges; returns the protocol result. */
    async compress(conversationId, content, expectedRevision) {
      const response = await fetchImpl(`${base}/__bili/plugin/tool`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          tool: 'compress',
          nativeCaller: true,
          ...(expectedRevision === undefined ? {} : { expectedRevision }),
          args: { content },
        }),
      })
      return jsonOrThrow(response, 'compress')
    },
  }
}

/** Map snapshot rawIds to their refs; a protected entry keeps `ref: null`. */
export function refsByRawId(snapshot) {
  const map = new Map()
  const entries = Array.isArray(snapshot?.orderedMessages) ? snapshot.orderedMessages : []
  for (const entry of entries) {
    if (typeof entry?.rawId === 'string') map.set(entry.rawId, entry.ref ?? null)
  }
  return map
}
