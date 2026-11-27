/**
 * dsh-taskline-core plugin entry: task tools, plugin-record persistence,
 * automatic attribution, and resume rebuild.
 *
 * Task boundaries are surface POSITIONS resolved from a recorded surface-node
 * seq, never numeric seq ranges. See the v0.1 spec for the model.
 */
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'

import { TASK_EVENT_TYPE, foldTaskEvents } from './model.js'
import { tasklineProjection } from './projection.js'
import { Config as ConfigSchema, resolveConfig } from './config.js'

let pluginCtx

/** Resolve the host-owned Session by id; agent.session can be a scoped view. */
function hostSession(session) {
  const candidate = pluginCtx?.get?.('sessions')?.get?.(session?.id)
  return candidate ?? session
}

export const Config = ConfigSchema

export const name = 'taskline-core'
export const inject = ['tools', 'sessionProjections', 'systemPrompt', 'loader']

const GUIDANCE = `## Task tracking with taskline

When a turn needs several tool calls or several steps, create a task with task_start before the substantive work, and close it with task_complete when the deliverable is done. Use task_status to inspect the tree, task_rename to fix a title, task_abandon when work is dropped, and task_reopen when resuming.

After consecutive non-task tool calls (default 3) taskline may create a task automatically. Treat that task as yours: rename it if the title is wrong, keep working inside it, and complete it before the final answer. While a task is open, new automatic tasks are suppressed.

Only when the bili taskline backend is available: call task_compress with closed tasks to compress their history, passing {taskId, summary} pairs. Never compress an open task. Write the summary yourself; do not include message-range headers such as m00001-m00010. The surface write-back may be deferred until the turn stops.

If a periodic bili nudge asks you to call compress with content blocks (mNNNNN-mNNNNN), ignore that instruction: on this profile compression is task-scoped only.

When a nudge arrives but the tree has no task covering the history (legacy conversation, or pure chat between tasks): do not skip compression for lack of a task. Create one with task_start({ title: "历史记录", includeHistory: true }), close it with task_complete, then call task_compress with tasks:[{taskId, summary}] using a summary you write yourself. If closed tasks already cover the history, compress those tasks directly.`

let runtime = resolveConfig()
let rawConfig = {}

/** Per-agent task state, rebuilt lazily from the session log. */
const states = new WeakMap()

function lastSurfaceSeq(session) {
  const nodes = session?.surface?.nodes
  if (!Array.isArray(nodes) || nodes.length === 0) return undefined
  return nodes[nodes.length - 1]
}

function readEvents(session) {
  if (session === undefined) return []
  const events = session.snapshotEvents()
  const out = []
  for (const event of events) {
    const record = pluginRecordOf(event)
    if (record !== undefined && record.type === TASK_EVENT_TYPE) out.push(record.data)
  }
  return out
}

function load(agent) {
  const session = agent.session
  const events = readEvents(session)
  let tasks = foldTaskEvents(events, { maxDepth: runtime.nesting.maxDepth })
  // A seeded session inherited its prefix from a fork; mark the inherited open
  // tasks once, in this session's own log, so the child tree says so explicitly.
  if (session.header?.isSeeded === true) {
    const ownFork = events.some((event) => event.op === 'fork' && event.sessionId === session.id)
    if (!ownFork) {
      const inheritedOpenIds = tasks.order.filter((id) => tasks.tasks.get(id).state === 'open')
      const fork = { op: 'fork', sessionId: session.id, inheritedOpenIds }
      appendPluginRecord(session, TASK_EVENT_TYPE, fork)
      tasks = foldTaskEvents([...events, fork], { maxDepth: runtime.nesting.maxDepth })
    }
  }
  return {
    session,
    seq: session.seq,
    maxDepth: runtime.nesting.maxDepth,
    tasks,
    pendingCalls: 0,
  }
}

function stateFor(agent) {
  let state = states.get(agent)
  const seq = agent.session?.seq
  if (state === undefined || (typeof seq === 'number' && state.seq !== seq)) {
    const pendingCalls = state?.pendingCalls ?? 0
    state = load(agent)
    state.pendingCalls = pendingCalls
    states.set(agent, state)
  }
  return state
}

function appendRecord(session, event) {
  try {
    appendPluginRecord(hostSession(session), TASK_EVENT_TYPE, event)
  } catch (error) {
    if (String(error?.message ?? '').includes('instance of class Session')) {
      throw new Error('taskline: the plugin resolved a different @deepseek-ai/dsh-session than the host; remove stale node_modules copies and reinstall the bundle so the peer resolves to the host copy')
    }
    throw error
  }
}

function appendTaskEventToSession(session, event) {
  appendRecord(session, event)
  return event
}

function appendEvent(agent, event) {
  appendRecord(agent.session, event)
  const state = stateFor(agent)
  const session = hostSession(agent.session)
  state.tasks = foldTaskEvents([...readEvents(session)], { maxDepth: state.maxDepth })
  state.seq = session.seq
  return state
}

function nextRootId(order) {
  let max = 0
  for (const id of order) {
    const match = /^t-(\d+)$/.exec(id)
    if (match !== null) max = Math.max(max, Number(match[1]))
  }
  return `t-${max + 1}`
}

function nextChildId(order, parentId) {
  let max = 0
  const prefix = `${parentId}.`
  for (const id of order) {
    if (!id.startsWith(prefix)) continue
    const rest = id.slice(prefix.length)
    if (!rest.includes('.')) max = Math.max(max, Number(rest))
  }
  return `${parentId}.${max + 1}`
}

function eventMessage(event) {
  return event?.data?.message ?? event?.data
}

function eventMessageId(event) {
  const message = eventMessage(event)
  return typeof message?.id === 'string' ? message.id : undefined
}

function protectedAnchor(event) {
  if (event === undefined) return true
  if (event.type === 'tool/call' || event.type === 'tool/result') return true
  if (event.type === 'system/message' || event.type === 'developer/message') return true
  if (event.type === 'user/message' && event.data?.source?.kind !== 'user') return true
  const blocks = eventMessage(event)?.content
  if (event.type === 'assistant/message' && Array.isArray(blocks)
    && blocks.some((block) => block?.type === 'tool-call' || block?.type === 'tool_use')) return true
  return false
}

function startBoundaryFor(session) {
  const nodes = session?.surface?.nodes ?? []
  for (const seq of [...nodes].reverse()) {
    const event = typeof session.eventAt === 'function' ? session.eventAt(seq) : undefined
    if (!protectedAnchor(event)) {
      const messageId = eventMessageId(event)
      return { atSeq: session.seq, anchorSeq: seq, ...(messageId === undefined ? {} : { messageId }) }
    }
  }
  return boundaryFor(session)
}

function boundaryFor(session) {
  const anchorSeq = lastSurfaceSeq(session)
  if (anchorSeq === undefined) throw new Error('taskline: no surface node to anchor this task')
  const event = typeof session.eventAt === 'function' ? session.eventAt(anchorSeq) : undefined
  const messageId = eventMessageId(event)
  return { atSeq: session.seq, anchorSeq, ...(messageId === undefined ? {} : { messageId }) }
}

function historyBoundary(session) {
  const nodes = session?.surface?.nodes ?? []
  const anchorSeq = nodes[0]
  const messageId = anchorSeq === undefined ? undefined : eventMessageId(session.eventAt?.(anchorSeq))
  return { atSeq: session.seq, anchorSeq, ...(messageId === undefined ? {} : { messageId }) }
}

function createTask(agent, title, parentTaskId, autoCreated = false, includeHistory = false, startBoundary = undefined) {
  const state = stateFor(agent)
  const { order, tasks } = state.tasks
  if (parentTaskId !== null) {
    const parent = tasks.get(parentTaskId)
    if (parent === undefined) throw new Error(`taskline: unknown parent task ${parentTaskId}`)
    if (parent.state !== 'open') throw new Error(`taskline: parent task ${parentTaskId} is not open`)
    if (state.maxDepth === 0) throw new Error('taskline: nesting is disabled (nesting.maxDepth=0)')
    const depth = parentTaskId.split('.').length
    if (depth + 1 > state.maxDepth) {
      throw new Error(`taskline: nesting depth ${depth + 1} exceeds nesting.maxDepth=${state.maxDepth}`)
    }
  }
  const id = parentTaskId === null ? nextRootId(order) : nextChildId(order, parentTaskId)
  // Closing the previous open root is a separate event so the log stays a fact trail.
  if (parentTaskId === null) {
    const openRoot = order
      .map((taskId) => tasks.get(taskId))
      .find((task) => task.state === 'open' && task.parentTaskId === null)
    if (openRoot !== undefined) {
      appendEvent(agent, { op: 'complete', id: openRoot.id, outcome: 'completed', end: boundaryFor(agent.session) })
    }
  }
  appendEvent(agent, {
    op: 'create',
    task: {
      id,
      title,
      parentTaskId: parentTaskId ?? null,
      autoCreated,
      start: startBoundary ?? (includeHistory ? historyBoundary(agent.session) : startBoundaryFor(agent.session)),
    },
  })
  return { taskId: id, startSeq: stateFor(agent).tasks.tasks.get(id).start.anchorSeq }
}

function summarize(state) {
  const { order, tasks, openRootId } = state.tasks
  return {
    openRootId,
    tasks: order
      .map((id) => tasks.get(id))
      .filter((task) => task.state === 'open' || task.end !== undefined)
      .slice(-20)
      .map((task) => ({
        id: task.id,
        title: task.title,
        state: task.state,
        parentTaskId: task.parentTaskId,
        startSeq: task.start.anchorSeq,
        endSeq: task.end?.anchorSeq ?? null,
        autoCreated: task.autoCreated,
        inherited: task.inherited === true,
      })),
  }
}

const textOutput = (text) => [{ type: 'text', text }]

function outputFor(schema) {
  return { schema, render: (_args, value) => textOutput(JSON.stringify(value)) }
}

const taskStart = {
  name: 'task_start',
  description:
    'Start one taskline task. A task owns a surface range; closing it makes the range eligible for task-aware compaction. Pass parentTaskId only when nesting is enabled.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      parentTaskId: { type: 'string' },
      includeHistory: { type: 'boolean', description: 'Anchor this task at the first surface node so untasked legacy chat is included in its range' },
    },
    required: ['title'],
  },
  output: outputFor({
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string' }, startSeq: { type: 'number' }, title: { type: 'string' } },
    required: ['taskId', 'startSeq', 'title'],
  }),
  async execute(args, exec) {
    const agent = exec.agent
    if (agent === undefined) throw new Error('taskline: no agent for task_start')
    return { ...createTask(agent, String(args.title), args.parentTaskId === undefined ? null : String(args.parentTaskId), false, args.includeHistory === true), title: String(args.title) }
  },
}

const taskComplete = {
  name: 'task_complete',
  description: 'Close one open taskline task as completed or abandoned. The task surface range becomes compactible.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      taskId: { type: 'string' },
      outcome: { type: 'string', enum: ['completed', 'abandoned'] },
    },
    required: ['taskId'],
  },
  output: outputFor({
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string' }, state: { type: 'string' }, title: { type: 'string' } },
    required: ['taskId', 'state', 'title'],
  }),
  async execute(args, exec) {
    const agent = exec.agent
    if (agent === undefined) throw new Error('taskline: no agent for task_complete')
    const state = stateFor(agent)
    const task = state.tasks.tasks.get(String(args.taskId))
    if (task === undefined) throw new Error(`taskline: unknown task ${String(args.taskId)}`)
    if (task.state !== 'open') throw new Error(`taskline: task ${task.id} is already ${task.state}`)
    const outcome = args.outcome === 'abandoned' ? 'abandoned' : 'completed'
    appendEvent(agent, { op: 'complete', id: task.id, outcome, end: boundaryFor(agent.session) })
    return { taskId: task.id, state: outcome, title: task.title }
  },
}

const taskRename = {
  name: 'task_rename',
  description: 'Rename one open taskline task. Closed tasks cannot be renamed.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string' }, title: { type: 'string' } },
    required: ['taskId', 'title'],
  },
  output: outputFor({
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string' }, title: { type: 'string' } },
    required: ['taskId', 'title'],
  }),
  async execute(args, exec) {
    const agent = exec.agent
    if (agent === undefined) throw new Error('taskline: no agent for task_rename')
    const state = stateFor(agent)
    const task = state.tasks.tasks.get(String(args.taskId))
    if (task === undefined) throw new Error(`taskline: unknown task ${String(args.taskId)}`)
    if (task.state !== 'open') throw new Error(`taskline: task ${task.id} is not open`)
    const title = String(args.title)
    appendEvent(agent, { op: 'rename', id: task.id, title, atSeq: agent.session.seq })
    return { taskId: task.id, title }
  },
}

const taskAbandon = {
  name: 'task_abandon',
  description: 'Abandon one open taskline task. An abandoned parent cascades to its open children.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string' } },
    required: ['taskId'],
  },
  output: outputFor({
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string' }, state: { type: 'string' }, title: { type: 'string' } },
    required: ['taskId', 'state', 'title'],
  }),
  async execute(args, exec) {
    const agent = exec.agent
    if (agent === undefined) throw new Error('taskline: no agent for task_abandon')
    const state = stateFor(agent)
    const task = state.tasks.tasks.get(String(args.taskId))
    if (task === undefined) throw new Error(`taskline: unknown task ${String(args.taskId)}`)
    if (task.state !== 'open') throw new Error(`taskline: task ${task.id} is not open`)
    appendEvent(agent, { op: 'complete', id: task.id, outcome: 'abandoned', end: boundaryFor(agent.session) })
    return { taskId: task.id, state: 'abandoned', title: task.title }
  },
}

const taskReopen = {
  name: 'task_reopen',
  description: 'Reopen one closed taskline task. Its parent must still be open.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string' } },
    required: ['taskId'],
  },
  output: outputFor({
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string' }, state: { type: 'string' }, title: { type: 'string' } },
    required: ['taskId', 'state', 'title'],
  }),
  async execute(args, exec) {
    const agent = exec.agent
    if (agent === undefined) throw new Error('taskline: no agent for task_reopen')
    const state = stateFor(agent)
    const task = state.tasks.tasks.get(String(args.taskId))
    if (task === undefined) throw new Error(`taskline: unknown task ${String(args.taskId)}`)
    if (task.state === 'open') throw new Error(`taskline: task ${task.id} is already open`)
    appendEvent(agent, { op: 'reopen', id: task.id, atSeq: agent.session.seq })
    return { taskId: task.id, state: 'open', title: task.title }
  },
}

const taskStatus = {
  name: 'task_status',
  description: 'Read the open taskline task and the most recent closed tasks with their surface ranges.',
  parameters: { type: 'object', additionalProperties: false, properties: {} },
  output: outputFor({ type: 'object' }),
  async execute(_args, exec) {
    const agent = exec.agent
    if (agent === undefined) throw new Error('taskline: no agent for task_status')
    return summarize(stateFor(agent))
  },
}

export function apply(ctx, config) {
  rawConfig = ctx.fiber?.entry?.options?.config ?? config
  runtime = resolveConfig(rawConfig)
  pluginCtx = ctx
  const COMPRESSOR_ENTRIES = {
    builtin: [],
    bili: ['taskline-bili', 'taskline-bili-adapter', 'bili-native', 'bili-compaction-gate'],
  }

  async function applyCompressor() {
    const wanted = runtime.compaction.compressor === 'builtin' ? 'builtin' : 'bili'
    const loader = ctx.get('loader')
    if (loader === undefined) return
    try {
    for (const [compressor, ids] of Object.entries(COMPRESSOR_ENTRIES)) {
      const enabled = compressor === wanted
      for (const id of ids) {
        const entry = [...loader.entries()].find((row) => row.options.id === id)
        if (entry === undefined) continue
        if (entry.disabled === enabled) await entry.update({ disabled: !enabled })
      }
    }
    } catch (error) {
      console.error('[taskline] compressor switch failed', error)
    }
  }

  let compressorTimer
  async function refreshFromEntry() {
    rawConfig = ctx.fiber?.entry?.options?.config ?? rawConfig
    runtime = resolveConfig(rawConfig)
    // Wait for the loader's group reconcile to finish before toggling children.
    clearTimeout(compressorTimer)
    compressorTimer = setTimeout(() => { void applyCompressor() }, 150)
  }

  ctx.on('loader/volatile-update', () => { void refreshFromEntry() })
  ctx.on('loader/entry-init', (entry) => {
    if (['taskline-bili', 'taskline-bili-adapter', 'bili-native', 'bili-compaction-gate'].includes(String(entry?.options?.id))) {
      compressorTimer = setTimeout(() => { void applyCompressor() }, 150)
    }
  })
  setTimeout(() => { void applyCompressor() }, 0)

  ctx.systemPrompt.section({ name: 'taskline:guidance', order: 130, interpolate: false, text: GUIDANCE })
  const lastInjection = new WeakMap()

  function taskStateText(state) {
    const all = [...state.tasks.tasks.values()]
    const open = all.filter((task) => task.state === 'open')
    if (open.length > 0) {
      return `Open taskline tasks:\n${open.map((task) => `- ${task.id}: ${task.title}`).join('\n')}\nComplete or rename them before the final answer.`
    }
    const closed = all.filter((task) => task.state !== 'open').slice(-5)
    if (closed.length === 0) return 'Taskline: no tasks in this session yet.'
    return `Taskline: no open task. Recent closed tasks:\n${closed.map((task) => `- ${task.id}: ${task.title}`).join('\n')}`
  }

  function injectTaskState(agent, turnSeq) {
    const session = agent.session
    if (session === undefined || typeof session.append !== 'function') return
    let text
    try {
      text = taskStateText(stateFor(agent))
    } catch {
      return
    }
    const previous = lastInjection.get(session)
    if (previous !== undefined && (previous.text === text || turnSeq <= previous.turnSeq)) return
    lastInjection.set(session, { text, turnSeq })
    session.append('user/message', {
      id: crypto.randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: `<system-reminder>\n${text}\n</system-reminder>` }],
      source: { kind: 'taskline', form: 'snapshot', sections: [{ name: 'taskline-state', text }] },
    }, { surfaceOp: 'append' })
  }

  const turnStart = new WeakMap()

  function lastUserEvent(session) {
    const events = typeof session?.snapshotEvents === 'function' ? session.snapshotEvents() : []
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type !== 'user/message') continue
      const content = eventMessage(event)?.content ?? event.data?.content
      const text = Array.isArray(content)
        ? content.filter((block) => block?.type === 'text').map((block) => block.text).join(' ')
        : typeof content === 'string' ? content : ''
      const trimmed = text.trim()
      if (trimmed.length === 0 || trimmed.startsWith('<system-reminder') || trimmed.startsWith('Time sampled while preparing')) continue
      return { seq: event.seq, messageId: event.data?.message?.id, text: trimmed }
    }
    return undefined
  }

  ctx.on('agent/pre-step', async (payload, next) => {
    const agent = payload?.agent
    if (agent !== undefined) {
      const user = lastUserEvent(agent.session)
      if (user !== undefined && user.text.length > 0) {
        if (!turnStart.has(agent.session)) turnStart.set(agent.session, user)
        injectTaskState(agent, user.seq)
      }
    }
    return next()
  })

  ctx.on('agent/turn-stopping', async ({ agent }) => {
    if (agent === undefined || runtime.autoCreate.enabled !== true) return
    const session = agent.session
    const user = turnStart.get(session)
    if (user === undefined) return
    turnStart.delete(session)
    try {
      const state = stateFor(agent)
      const covered = [...state.tasks.tasks.values()].some((task) => task.start?.atSeq !== undefined && task.start.atSeq >= user.seq)
      if (covered) return
      const title = `对话：${user.text.slice(0, 30)}`
      const startBoundary = { atSeq: user.seq, anchorSeq: user.seq, ...(typeof user.messageId === 'string' ? { messageId: user.messageId } : {}) }
      const created = createTask(agent, title, null, true, false, startBoundary)
      appendEvent(agent, { op: 'complete', id: created.taskId, outcome: 'completed', end: boundaryFor(session) })
    } catch (error) {
      console.error('[taskline] turn task failed', error)
    }
  })

  ctx.tools.register(taskStart)
  ctx.tools.register(taskComplete)
  ctx.tools.register(taskStatus)
  ctx.tools.register(taskRename)
  ctx.tools.register(taskAbandon)
  ctx.tools.register(taskReopen)
  ctx.sessionProjections.register(tasklineProjection())
  ctx.provide('taskline', {
    treeOf: (session) => foldTaskEvents(readEvents(session), { maxDepth: runtime.nesting.maxDepth }),
    append: (session, event) => appendTaskEventToSession(session, event),
    boundary: (session) => boundaryFor(session),
    config: () => runtime.compaction,
    reminder: () => runtime.reminder,
  })

  ctx.inject(['connection', 'sessions'], (scope) => {
    scope.connection.rpc.handle('/taskline', async (method, payload, signal, peer) => {
      const forbidden = {
        ok: false,
        error: { code: 'taskline/forbidden', message: 'taskline requests require owner access', details: {} },
      }
      if (peer?.principal?.kind !== 'owner') return forbidden
      try {
        signal.throwIfAborted()
        if (method === 'config-get') return { ok: true, value: runtime }
        if (method === 'config-set') {
          const editor = ctx.get('configEditor')
          if (editor === undefined) {
            return { ok: false, error: { code: 'taskline/no-config-editor', message: 'config editor unavailable', details: {} } }
          }
          const row = editor.configuration().find((item) => String(item.entry.options.id) === 'taskline-core')
          if (row === undefined) {
            return { ok: false, error: { code: 'taskline/no-entry', message: 'taskline-core entry not found', details: {} } }
          }
          const next = payload?.config
          if (next === null || typeof next !== 'object') {
            return { ok: false, error: { code: 'taskline/bad-config', message: 'config must be an object', details: {} } }
          }
          await editor.edit(row.entry, (current) => ({ ...current, ...next }))
          return { ok: true, value: next }
        }
        const sessionId = String(payload?.sessionId ?? '')
        const session = scope.sessions.get(sessionId)
        if (session === undefined) {
          return { ok: false, error: { code: 'taskline/unknown-session', message: `unknown session ${sessionId}`, details: {} } }
        }
        const taskId = String(payload?.taskId ?? '')
        if (method === 'rename') {
          const title = String(payload?.title ?? '')
          appendTaskEventToSession(session, { op: 'rename', id: taskId, title, atSeq: session.seq })
          return { ok: true, value: { taskId, title } }
        }
        if (method === 'complete' || method === 'abandon') {
          appendTaskEventToSession(session, {
            op: 'complete',
            id: taskId,
            outcome: method === 'abandon' ? 'abandoned' : 'completed',
            end: boundaryFor(session),
          })
          const title = pluginCtx?.get?.('taskline')?.treeOf?.(session)?.tasks?.get(taskId)?.title
          return { ok: true, value: { taskId, title, state: method === 'abandon' ? 'abandoned' : 'completed' } }
        }
        if (method === 'reopen') {
          appendTaskEventToSession(session, { op: 'reopen', id: taskId, atSeq: session.seq })
          const title = pluginCtx?.get?.('taskline')?.treeOf?.(session)?.tasks?.get(taskId)?.title
          return { ok: true, value: { taskId, title, state: 'open' } }
        }
        return { ok: false, error: { code: 'taskline/unknown-method', message: `unknown method ${String(method)}`, details: {} } }
      } catch (error) {
        return { ok: false, error: { code: 'taskline/request-failed', message: String(error?.message ?? error), details: {} } }
      }
    })
  }, 'taskline: rpc')

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    const agent = exec.agent
    if (agent === undefined) return decision
    if (exec.name.startsWith('task_')) return decision
    const state = stateFor(agent)
    if (state.tasks.openRootId !== null) {
      state.pendingCalls = 0
      return decision
    }
    state.pendingCalls += 1
    if (runtime.autoCreate.enabled !== true || state.pendingCalls < runtime.autoCreate.thresholdCalls) return decision
    state.pendingCalls = 0
    try {
      createTask(agent, inferTitle(exec), null, true)
    } catch {
      // Auto attribution must never fail a tool call.
    }
    return decision
  })
}
