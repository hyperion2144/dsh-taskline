/**
 * taskline-compactor: compacts closed task spans through the preset's native
 * compaction service, then records one compact event per attempt.
 */
import { planRanges } from './plan.js'

export const name = 'taskline-compactor'
export const inject = ['taskline']

const DEFAULT_TASKS_LATER = 2

const queues = new WeakMap()
const gated = new WeakSet()

export function apply(ctx) {

  const queue = (session, task) => {
    const previous = queues.get(session) ?? Promise.resolve()
    const next = previous.then(task, task)
    queues.set(session, next.catch(() => undefined))
    return next
  }

  async function compactAgent(agent, agentPresets, { manual = false } = {}) {
    const session = agent.session
    const config = ctx.taskline.config()
    if (config.enabled !== true) return { status: 'disabled' }
    if (gated.has(session)) return { status: 'gated' }
    const bili = ctx.get('taskline:bili')
    const biliActive = (config.compressor ?? 'bili') === 'bili' && bili !== undefined && (await bili.available())
    if (biliActive) return { status: 'model-driven' }
    const tree = ctx.taskline.treeOf(session)
    const openIds = tree.order.filter((id) => tree.tasks.get(id).state === 'open')
    const tasks = tree.order.map((id) => {
      const task = tree.tasks.get(id)
      return { id: task.id, state: task.state, startSeq: task.start.anchorSeq, endSeq: task.end?.anchorSeq ?? null }
    })
    const tasksLater = manual ? 0 : (config.tasksLater ?? DEFAULT_TASKS_LATER)
    const ranges = planRanges({ surface: session.surface.nodes, tasks, tasksLater })
    if (ranges.length === 0) return { status: 'empty' }
    const backend = config.backend ?? 'auto'
    const engine = agentPresets.serviceFor(agent, 'compaction')
    if (engine === undefined || typeof engine.compactRegion !== 'function') return { status: 'no-engine' }
    let ok = 0
    for (const range of ranges) {
      const requested = range.taskIds
      try {
        await engine.compactRegion(range.start, range.end, agent, new AbortController().signal)
        ctx.taskline.append(session, {
          op: 'compact', backend: 'native', outcome: 'ok',
          fromSeq: range.start, toSeq: range.end, taskIds: requested, requested, kept: requested, skipped: openIds, atSeq: session.seq,
        })
        ok += 1
      } catch {
        ctx.taskline.append(session, {
          op: 'compact', backend: 'native', outcome: 'failed',
          fromSeq: range.start, toSeq: range.end, taskIds: requested, requested, kept: requested, skipped: openIds, atSeq: session.seq,
        })
      }
    }
    return { status: 'done', count: ok }
  }

  async function biliCompressTasks(agent, tasksArg) {
    const session = agent.session
    const tree = ctx.taskline.treeOf(session)
    const tasks = tree.order.map((id) => {
      const task = tree.tasks.get(id)
      return { id: task.id, state: task.state, startSeq: task.start.anchorSeq, endSeq: task.end?.anchorSeq ?? null }
    })
    const summaries = new Map()
    const requested = []
    for (const item of Array.isArray(tasksArg) ? tasksArg : []) {
      if (item === null || typeof item !== 'object') continue
      if (typeof item.taskId === 'string' && typeof item.summary === 'string' && item.summary.trim().length > 0) {
        summaries.set(item.taskId, item.summary)
        requested.push(item.taskId)
      }
    }
    if (summaries.size === 0) return { outcome: 'skipped', reason: 'summary-required', applied: 0, writtenBack: 0 }
    let ranges = planRanges({ surface: session.surface.nodes, tasks, tasksLater: 0 })
    ranges = ranges.filter((range) => range.taskIds.every((id) => summaries.has(id)))
    if (ranges.length === 0) return { outcome: 'skipped', reason: 'no-range', applied: 0, writtenBack: 0 }
    const bili = ctx.get('taskline:bili')
    if (bili === undefined) return { outcome: 'skipped', reason: 'bili-unavailable', applied: 0, writtenBack: 0 }
    const boundaries = new Map(tree.order.map((id) => {
      const task = tree.tasks.get(id)
      return [id, {
        title: task.title,
        summary: summaries.get(id),
        startMessageId: task.start?.messageId,
        endMessageId: task.end?.messageId,
        startSeq: task.start?.anchorSeq,
        endSeq: task.end?.anchorSeq,
      }]
    }))
    const result = await bili.compressRanges(session, boundaries, ranges)
    ctx.taskline.append(session, {
      op: 'compact', backend: 'bili', outcome: result.outcome,
      summary: summaries.get(ranges[0]?.taskIds?.[0]) ?? '',
      beforeTokens: (result.ranges ?? []).reduce((total, item) => total + (Number.isFinite(item.tokens) ? item.tokens : 0), 0),
      afterTokens: (() => {
        const kept = (result.ranges ?? []).filter((item) => item.status === 'applied').flatMap((item) => item.taskIds)
        const text = kept.map((id) => summaries.get(id) ?? '').join('')
        return text.length === 0 ? 0 : Math.ceil(text.length / 3)
      })(),
      reason: (result.ranges ?? []).filter((item) => item.status !== 'applied').map((item) => `${item.status}:${item.reason ?? ''}`).join('; '),
      fromSeq: ranges[0].start, toSeq: ranges[0].end,
      taskIds: ranges.flatMap((range) => range.taskIds),
      requested: ranges.flatMap((range) => range.taskIds),
      kept: (result.ranges ?? []).filter((item) => item.status === 'applied').flatMap((item) => item.taskIds),
      skipped: (result.ranges ?? []).filter((item) => item.status !== 'applied').flatMap((item) => item.taskIds),
      atSeq: session.seq,
    })
    return {
      ...result,
      tasks: tree.order.map((id) => ({ taskId: id, title: tree.tasks.get(id).title })),
    }
  }

  const taskCompress = {
    name: 'task_compress',
    description: 'Compress closed taskline tasks through bili. Write each range summary yourself following bili compress guidance, then pass tasks:[{taskId, summary}]. Automatic taskline compression is disabled while bili is active; compressed ranges are written back into the DSH surface. Task-scoped only: pass tasks:[{taskId, summary}]; bili content blocks are not accepted.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { taskId: { type: 'string' }, summary: { type: 'string' } },
            required: ['taskId', 'summary'],
          },
        },
      },
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('taskline: no agent for task_compress')
      return biliCompressTasks(exec.agent, args.tasks)
    },
  }

  const taskBiliStatus = {
    name: 'task_bili_status',
    description: 'Report bili proxy availability, context tokens, and compressible range count for this session.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      if (exec.agent === undefined) throw new Error('taskline: no agent for task_bili_status')
      const bili = ctx.get('taskline:bili')
      if (bili === undefined) return { available: false }
      return bili.status(exec.agent.session)
    },
  }

  function pressureExceeded(session, tokenMeter) {
    const config = ctx.taskline.config()
    if (config.enabled !== true) return false
    const header = typeof session.requestHeader === 'function' ? session.requestHeader() : undefined
    const window = (config.contextLimit ?? 0) > 0 ? config.contextLimit : header?.config?.maxTokens ?? 64000
    const measurement = tokenMeter.measure(session)
    return measurement.totalTokens >= (config.thresholdRatio ?? 0.8) * window
  }

  ctx.inject(['tools'], (scope) => {
    scope.tools.register(taskCompress)
    scope.tools.register(taskBiliStatus)
    // Shadow bili's compress tool so bili's own nudge reaches taskline instead.
    if (typeof scope.tools.get !== 'function' || scope.tools.get('compress') === undefined) {
      try {
        scope.tools.register({ ...taskCompress, name: 'compress',
          description: 'Compress closed taskline tasks through bili. Task-scoped only: pass tasks:[{taskId, summary}]; do not send bili content blocks (mNNNNN-mNNNNN). The result is written back into the DSH surface.' })
      } catch {
        // bili-native may have registered first; its adoption path keeps working.
      }
    }
  })

  ctx.inject(['agentPresets'], (scope) => {
    ctx.on('tools/post-execute', async (exec, result, next) => {
      const decision = await next()
      if ((exec.name === 'task_complete' || exec.name === 'task_abandon') && exec.agent !== undefined) {
        void queue(exec.agent.session, () => compactAgent(exec.agent, scope.agentPresets))
      }
      return decision
    })
  })

  ctx.inject(['agentPresets', 'commands', 'tokenMeter'], (scope) => {
    scope.commands.register({
      name: 'taskline',
      description: 'Taskline: compact closed task spans or gate automatic compaction',
      input: { hint: '[compact|gate on|gate off]' },
      handler: async (invocation) => {
        const input = String(invocation.rawInput ?? '').trim()
        if (input === 'gate off') {
          gated.add(invocation.agent.session)
          return { kind: 'success', text: 'Taskline gate off for this session.' }
        }
        if (input === 'gate on') {
          gated.delete(invocation.agent.session)
          return { kind: 'success', text: 'Taskline gate on for this session.' }
        }
        if (input !== 'compact') return { kind: 'error', text: 'Usage: /taskline [compact|gate on|gate off]' }
        const result = await queue(invocation.agent.session, () => compactAgent(invocation.agent, scope.agentPresets, { manual: true }))
        if (result.status === 'disabled') return { kind: 'error', text: 'taskline compaction is disabled in settings.' }
        if (result.status === 'gated') return { kind: 'error', text: 'taskline gate is off for this session.' }
        if (result.status === 'empty') return { kind: 'success', text: 'No compactable task span yet.' }
        if (result.status === 'no-engine') return { kind: 'error', text: 'No compaction engine is available for this agent.' }
        return { kind: 'success', text: `Compacted ${result.count} task span(s).` }
      },
    })

    ctx.on('agent/turn-stopping', ({ agent }) => {
      if (agent === undefined) return
      try {
        if (!pressureExceeded(agent.session, scope.tokenMeter)) return
      } catch {
        return
      }
      void queue(agent.session, () => compactAgent(agent, scope.agentPresets))
    })
  })
}
