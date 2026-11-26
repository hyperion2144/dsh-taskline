/**
 * dsh-taskline-bili-adapter: applies planned task ranges through the bili
 * plugin protocol and mirrors each applied compression into the DSH surface.
 */
import { buildCompressContent, sanitizeSummary } from './map.js'
import { shadowedRangeOf, writeBack } from './surface.js'
import { readBiliBlocks } from './fold-db.js'

export const name = 'taskline-bili-adapter'
export const inject = ['taskline', 'bili:runtime']

function messageAt(session, seq) {
  try {
    const data = session.eventAt?.(seq)?.data
    const message = data?.message ?? data
    if (message === undefined) return undefined
    const text = (message.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    return { role: message.role, text }
  } catch {
    return undefined
  }
}

/** When msgid pin failed, map by message order: DSH derived messages align with the snapshot list. */
function augmentRefsByOrder(refsByRaw, snapshot, session, boundaries) {
  if (typeof session.deriveMessages !== 'function') return
  const derived = session.deriveMessages().filter((message) => message?.role !== 'system' && message?.role !== 'developer')
  const indexById = new Map(derived.map((message, index) => [message.id, index]))
  const wire = (snapshot?.messages ?? []).filter((message) => message?.role !== 'system' && message?.role !== 'developer')
  for (const boundary of boundaries.values()) {
    for (const idKey of ['startMessageId', 'endMessageId']) {
      const messageId = boundary[idKey]
      if (typeof messageId !== 'string' || refsByRaw.has(messageId)) continue
      const index = indexById.get(messageId)
      if (index === undefined) continue
      const ref = wire[index]?.ref
      if (typeof ref === 'string') refsByRaw.set(messageId, ref)
    }
  }
}

/** When msgid pin failed, snapshot rawIds are content-derived; match by role+text instead. */
function augmentRefs(refsByRaw, snapshot, session, boundaries) {
  const byText = new Map()
  for (const message of snapshot?.messages ?? []) {
    if (typeof message?.text === 'string' && typeof message?.role === 'string') {
      byText.set(`${message.role}\u0000${message.text}`, message.ref ?? null)
    }
  }
  for (const boundary of boundaries.values()) {
    for (const [idKey, seqKey] of [['startMessageId', 'startSeq'], ['endMessageId', 'endSeq']]) {
      const messageId = boundary[idKey]
      const seq = boundary[seqKey]
      if (typeof messageId !== 'string' || refsByRaw.has(messageId) || seq === undefined) continue
      const message = messageAt(session, seq)
      if (message === undefined) continue
      const ref = byText.get(`${message.role}\u0000${message.text}`)
      if (ref !== undefined) refsByRaw.set(messageId, ref)
    }
  }
}

export function apply(ctx) {
  const pending = new WeakMap()
  const lastFoldCount = new WeakMap()

  async function notifyCompacted(runtime, session) {
    try {
      await runtime.client.notifyCompacted(session.id)
    } catch {
      // The proxy may be gone; the DSH-side write-back already stands.
    }
  }

  async function compressRanges(session, taskBoundaries, ranges) {
    const runtime = ctx.get('bili:runtime')
    if (runtime === undefined || !(await runtime.available())) {
      return { outcome: 'skipped', reason: 'bili-unavailable', applied: 0, writtenBack: 0, deferred: 0, ranges: [] }
    }
    const snapshot = await runtime.client.snapshot(session.id)
    const refsByRaw = new Map()
    for (const entry of snapshot?.orderedMessages ?? []) {
      if (typeof entry?.rawId === 'string') refsByRaw.set(entry.rawId, entry.ref ?? null)
    }
    augmentRefs(refsByRaw, snapshot, session, taskBoundaries)
    augmentRefsByOrder(refsByRaw, snapshot, session, taskBoundaries)
    const meter = ctx.get('tokenMeter')
    const results = []
    let applied = 0
    let writtenBack = 0
    let deferred = 0
    for (const range of ranges) {
      const summary = sanitizeSummary(taskBoundaries.get(range.taskIds[0])?.summary ?? range.taskIds.join(', '))
      const ordered = Array.isArray(snapshot?.orderedMessages) ? snapshot.orderedMessages : []
      const { content, skipped } = buildCompressContent({ ranges: [range], taskBoundaries, refsByRaw, ordered })
      if (content.length === 0) {
        results.push({ taskIds: range.taskIds, status: 'skipped', reason: skipped[0]?.reason ?? 'unmapped' })
        continue
      }
      const result = await runtime.client.compress(session.id, content, snapshot.parentRevision)
      if (result?.outcome !== 'applied' && result?.outcome !== 'partial') {
        const detail = result?.error?.message ?? result?.result ?? result?.outcome ?? 'unknown'
        results.push({ taskIds: range.taskIds, status: 'refused', reason: String(detail).slice(0, 400) })
        continue
      }
      applied += 1
      const shadowed = shadowedRangeOf(session.surface.nodes, range.start, range.end)
      if (shadowed === undefined) {
        results.push({ taskIds: range.taskIds, status: 'written-skip', reason: 'stale-anchor' })
        continue
      }
      const shadowedTokenCount = meter === undefined
        ? 0
        : (meter.measure(session).nodes ?? [])
            .filter((node) => shadowed.shadowedSeqs.includes(node.seq))
            .reduce((total, node) => total + (node.tokens ?? 0), 0)
      const list = pending.get(session) ?? []
      list.push({ start: range.start, end: range.end, summary, shadowedTokenCount })
      pending.set(session, list)
      deferred += 1
      results.push({ taskIds: range.taskIds, status: 'applied', writtenBack: false, deferred: true, tokens: shadowedTokenCount })
    }
    return { outcome: applied > 0 ? 'ok' : 'skipped', applied, writtenBack, deferred, ranges: results }
  }

  async function status(session) {
    const runtime = ctx.get('bili:runtime')
    if (runtime === undefined || !(await runtime.available())) return { available: false }
    const current = await runtime.client.status(session.id)
    const ranges = Array.isArray(current?.compressibleRanges) ? current.compressibleRanges : []
    return {
      available: true,
      contextTokens: current?.contextTokens ?? null,
      contextLimit: current?.contextLimit ?? null,
      compressibleRanges: ranges.length,
    }
  }

  function openTurnOf(session) {
    if (typeof session.snapshotEvents !== 'function') return null
    let open = null
    for (const event of session.snapshotEvents()) {
      if (event.type === 'turn/start') open = event.data?.turn ?? null
      else if (event.type === 'turn/end' && (event.data?.turn ?? null) === open) open = null
    }
    return open
  }

  function alignToolPairs(session, start, end) {
    if (typeof session.snapshotEvents !== 'function') return { start, end }
    const events = session.snapshotEvents()
    const bySeq = new Map(events.map((event) => [event.seq, event]))
    const calls = new Map()
    for (const event of events) {
      if (event.type === 'tool/call') calls.set(event.data?.callId, event.seq)
    }
    let nextStart = start
    let nextEnd = end
    for (let changed = true; changed;) {
      changed = false
      for (const event of events) {
        if (event.seq < nextStart || event.seq > nextEnd) continue
        const callId = event.data?.callId
        if (callId === undefined) continue
        if (event.type === 'tool/call') {
          const result = events.find((candidate) => candidate.type === 'tool/result' && candidate.data?.callId === callId)
          if (result !== undefined && result.seq > nextEnd) { nextEnd = result.seq; changed = true }
        } else if (event.type === 'tool/result') {
          const callSeq = calls.get(callId)
          if (callSeq !== undefined && callSeq < nextStart) { nextStart = callSeq; changed = true }
        }
      }
    }
    return { start: nextStart, end: nextEnd }
  }

  function mirrorText(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim()
    return text.length > 240 ? `${text.slice(0, 240)}#${text.length}` : text
  }

  function surfaceMessages(session) {
    const out = []
    for (const seq of session?.surface?.nodes ?? []) {
      const event = typeof session.eventAt === 'function' ? session.eventAt(seq) : undefined
      if (event === undefined) continue
      let message
      let role
      if (event.type === 'user/message') { message = event.data?.message ?? event.data; role = 'user' }
      else if (event.type === 'assistant/message') { message = event.data?.message ?? event.data; role = 'assistant' }
      else if (event.type === 'tool/result') { message = event.data?.message ?? event.data; role = 'tool' }
      else continue
      if (message?.source?.kind === 'compact-checkpoint') continue
      const content = message?.content
      const text = Array.isArray(content)
        ? content.map((block) => {
            if (block?.type === 'text') return block.text
            if (block?.type === 'tool-call' || block?.type === 'tool_use') {
              const input = block.arguments ?? block.input ?? {}
              try { return typeof input === 'string' ? input : JSON.stringify(input) } catch { return '' }
            }
            return ''
          }).filter(Boolean).join('\n')
        : typeof content === 'string' ? content : ''
      if (text.trim().length === 0) continue
      out.push({ seq, role, text: mirrorText(text) })
    }
    return out
  }

  const mirroredBlocks = new WeakMap()

  function alignBlockSeqs(snapshot, surface, ids) {
    const wanted = new Set(ids)
    const queues = new Map()
    for (const message of surface) {
      const key = `${message.role}\u0000${message.text}`
      const queue = queues.get(key) ?? []
      queue.push(message.seq)
      queues.set(key, queue)
    }
    const seqs = []
    for (const message of Array.isArray(snapshot?.messages) ? snapshot.messages : []) {
      const role = message?.role
      if (!['user', 'assistant', 'tool'].includes(role)) continue
      const key = `${role}\u0000${mirrorText(message.text)}`
      const queue = queues.get(key)
      if (queue === undefined || queue.length === 0) continue
      const seq = queue.shift()
      if (wanted.has(String(message.rawId))) seqs.push(seq)
    }
    return seqs
  }

  async function mirrorBiliFolds(session) {
    const runtime = ctx.get('bili:runtime')
    if (runtime === undefined || !(await runtime.available())) return 0
    const blocks = ctx.get('taskline:foldBlocks')?.(session.id) ?? readBiliBlocks(session.id)
    if (blocks.length === 0) return 0
    const done = mirroredBlocks.get(session) ?? new Set()
    const fresh = blocks.filter((block) => !done.has(block.blockId))
    if (fresh.length === 0) return 0
    let snapshot
    try { snapshot = await runtime.client.snapshot(session.id) } catch { return 0 }
    const surface = surfaceMessages(session)
    const tree = ctx.taskline?.treeOf?.(session)
    const meter = ctx.get('tokenMeter')
    let mirrored = 0
    for (const block of fresh) {
      done.add(block.blockId)
      const seqs = alignBlockSeqs(snapshot, surface, block.messageIds)
      if (seqs.length === 0) {
        ctx.taskline?.append?.(session, {
          op: 'compact', backend: 'bili', outcome: 'skipped',
          summary: `bili block ${block.blockId} 的消息未能在当前 surface 中对齐，未回写。`,
          reason: 'fold-block-unmapped', fromSeq: null, toSeq: null,
          taskIds: [], requested: [], kept: [], skipped: [], atSeq: session.seq,
          beforeTokens: block.compressedTokens, afterTokens: 0,
        })
        continue
      }
      seqs.sort((left, right) => left - right)
      const start = seqs[0]
      const end = seqs[seqs.length - 1]
      const shadowed = shadowedRangeOf(session.surface.nodes, start, end)
      if (shadowed === undefined) continue
      const overlapping = tree === undefined
        ? []
        : tree.order.map((id) => tree.tasks.get(id)).filter((task) => {
            const taskStart = task.start?.anchorSeq
            const taskEnd = task.end?.anchorSeq
            if (!Number.isFinite(taskStart)) return false
            if (taskStart > end) return false
            return taskEnd === undefined || taskEnd === null || taskEnd >= start
          })
      const openIds = overlapping.filter((task) => task.state === 'open').map((task) => task.id)
      const coveredIds = overlapping.filter((task) => task.state !== 'open').map((task) => task.id)
      const tokens = block.compressedTokens
        || (meter === undefined ? 0 : (meter.measure(session).nodes ?? [])
          .filter((node) => shadowed.shadowedSeqs.includes(node.seq))
          .reduce((total, node) => total + (node.tokens ?? 0), 0))
      const summary = block.summary.length > 0
        ? block.summary
        : `bili 已自动折叠 ${block.messageIds.length} 条消息（约 ${tokens} tokens），可用 decompress 取回。`
      // Every bili fold is written back; open tasks receive explicit partial ranges.
      writeBack(session, { summary, shadowedRange: shadowed, shadowedTokenCount: tokens, turn: openTurnOf(session) })
      for (const id of openIds) {
        ctx.taskline?.append?.(session, {
          op: 'partial-compact', id, fromSeq: start, toSeq: end, blockId: block.blockId, atSeq: session.seq,
        })
      }
      ctx.taskline?.append?.(session, {
        op: 'compact', backend: 'bili', outcome: 'ok', summary, reason: 'auto-fold-mirror',
        fromSeq: start, toSeq: end,
        taskIds: [...coveredIds, ...openIds], requested: [...coveredIds, ...openIds],
        kept: coveredIds, skipped: [], partial: openIds, atSeq: session.seq,
        beforeTokens: tokens, afterTokens: Math.ceil(summary.length / 3),
      })
      mirrored += 1
    }
    if (mirrored > 0) {
      try { await ctx.get('sessions')?.flush?.(session) } catch {}
      await notifyCompacted(runtime, session)
    }
    mirroredBlocks.set(session, done)
    return mirrored
  }

  async function flushPending(session) {
    const runtime = ctx.get('bili:runtime')
    const turn = openTurnOf(session)
    const list = pending.get(session)
    if (list === undefined) return 0
    pending.delete(session)
    let written = 0
    for (const item of list) {
      const aligned = alignToolPairs(session, item.start, item.end)
      const shadowed = shadowedRangeOf(session.surface.nodes, aligned.start, aligned.end)
      if (shadowed === undefined) continue
      writeBack(session, { summary: item.summary, shadowedRange: shadowed, shadowedTokenCount: item.shadowedTokenCount, turn })
      written += 1
    }
    if (written > 0) {
      try {
        await ctx.get('sessions')?.flush?.(session)
      } catch {
        // Durability is best-effort here; the log transaction is already committed.
      }
      await notifyCompacted(runtime, session)
    }
    return written
  }

  async function syncFoldBaseline(session) {
    const runtime = ctx.get('bili:runtime')
    if (runtime === undefined || !(await runtime.available())) return
    try {
      const status = await runtime.client.status(session.id)
      const folds = Array.isArray(status?.contextView?.folds) ? status.contextView.folds.length : 0
      lastFoldCount.set(session, folds)
    } catch {}
  }

  ctx.on('agent/turn-stopping', async ({ agent }) => {
    if (agent === undefined) return
    const written = await flushPending(agent.session)
    if (written > 0) {
      // Our own task_compress already mirrored this fold; do not mirror it again.
      await syncFoldBaseline(agent.session)
      return
    }
    try { await mirrorBiliFolds(agent.session) } catch (error) { console.error('[taskline] fold mirror failed', error) }
  })

  async function available() {
    const runtime = ctx.get('bili:runtime')
    if (runtime === undefined) return false
    return runtime.available()
  }

  const forward = (name) => ({
    name,
    description: `Forward ${name} to the bili proxy with taskline's conversation id.`,
    parameters: { type: 'object', additionalProperties: true, properties: {} },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value).slice(0, 4000) }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error(`taskline: no agent for ${name}`)
      const runtime = ctx.get('bili:runtime')
      if (runtime === undefined || !(await runtime.available())) return { ok: false, error: 'bili-unavailable' }
      return runtime.client.tool(exec.agent.session.id, name, args ?? {})
    },
  })

  ctx.inject(['tools'], (scope) => {
    for (const name of ['decompress', 'search_context', 'acp_status', 'acp_cache']) {
      if (typeof scope.tools.get === 'function' && scope.tools.get(name) !== undefined) continue
      try {
        scope.tools.register(forward(name))
      } catch {
        // Another plugin already owns this name; bili-native adopts it too.
      }
    }
  })

  ctx.provide('taskline:bili', { compressRanges, status, available })
}
