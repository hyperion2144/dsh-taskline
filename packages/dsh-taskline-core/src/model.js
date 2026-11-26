/**
 * Pure task model: event validation, fold, and surface-position anchor resolution.
 *
 * The model never touches Cordis or the session; it is fed a plain event list and
 * returns a task tree. The plugin layer owns persistence and boundaries.
 */

export const TASK_EVENT_TYPE = 'plugin:taskline/event'

const TASK_ID = /^t-\d+(?:\.\d+)*$/
const OPS = new Set(['create', 'rename', 'complete', 'reopen', 'fork', 'compact', 'partial-compact'])

/** Throw a readable error for a malformed task event. */
export function validateEvent(event) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('taskline event must be an object')
  }
  if (!OPS.has(event.op)) throw new TypeError(`unknown taskline op: ${String(event.op)}`)
  switch (event.op) {
    case 'create': {
      const task = event.task
      if (task === null || typeof task !== 'object') throw new TypeError('create.task is required')
      if (!TASK_ID.test(task.id ?? '')) throw new TypeError(`invalid task id: ${String(task.id)}`)
      if (typeof task.title !== 'string' || task.title.length === 0) throw new TypeError('task title is required')
      if (task.parentTaskId !== null && task.parentTaskId !== undefined && !TASK_ID.test(task.parentTaskId)) {
        throw new TypeError(`invalid parentTaskId: ${String(task.parentTaskId)}`)
      }
      if (!task.start || typeof task.start.atSeq !== 'number' || typeof task.start.anchorSeq !== 'number') {
        throw new TypeError('task start boundary is required')
      }
      return
    }
    case 'rename':
      if (!TASK_ID.test(event.id ?? '')) throw new TypeError(`invalid task id: ${String(event.id)}`)
      if (typeof event.title !== 'string' || event.title.length === 0) throw new TypeError('rename title is required')
      return
    case 'complete':
      if (!TASK_ID.test(event.id ?? '')) throw new TypeError(`invalid task id: ${String(event.id)}`)
      if (event.outcome !== 'completed' && event.outcome !== 'abandoned') throw new TypeError('invalid outcome')
      if (!event.end || typeof event.end.atSeq !== 'number' || typeof event.end.anchorSeq !== 'number') {
        throw new TypeError('complete end boundary is required')
      }
      return
    case 'reopen':
      if (!TASK_ID.test(event.id ?? '')) throw new TypeError(`invalid task id: ${String(event.id)}`)
      return
    case 'compact':
      if (typeof event.backend !== 'string' || event.backend.length === 0) throw new TypeError('compact.backend is required')
      if (!['ok', 'skipped', 'failed'].includes(event.outcome)) throw new TypeError('invalid compact outcome')
      return
    case 'partial-compact':
      if (!TASK_ID.test(event.id ?? '')) throw new TypeError(`invalid task id: ${String(event.id)}`)
      if (!Number.isFinite(event.fromSeq) || !Number.isFinite(event.toSeq)) {
        throw new TypeError('partial-compact bounds are required')
      }
      return
    case 'fork':
      if (!Array.isArray(event.inheritedOpenIds)) throw new TypeError('fork.inheritedOpenIds must be an array')
      return
  }
}

/** Depth of a task id: root = 0, t-1.1 = 1, t-1.1.1 = 2. */
export function depthOfId(id) {
  const m = /^t-\d+((?:\.\d+)*)$/.exec(id)
  if (!m) throw new TypeError(`invalid task id: ${String(id)}`)
  return m[1] === '' ? 0 : m[1].split('.').length - 1
}

function must(tasks, id) {
  const task = tasks.get(id)
  if (task === undefined) throw new Error(`unknown task: ${id}`)
  return task
}

/**
 * Fold task events into a task tree.
 * @param events validated/unvalidated taskline events in log order
 * @param options.maxDepth maximum child depth (0 = no nesting)
 * @returns {{tasks: Map<string, object>, order: string[], openRootId: string | null}}
 */
export function foldTaskEvents(events, { maxDepth = 0 } = {}) {
  const tasks = new Map()
  const order = []
  for (const event of events) {
    validateEvent(event)
    switch (event.op) {
      case 'create': {
        const task = event.task
        if (tasks.has(task.id)) throw new Error(`duplicate task id: ${task.id}`)
        const parentTaskId = task.parentTaskId ?? null
        if (parentTaskId !== null) {
          const parent = must(tasks, parentTaskId)
          if (parent.state !== 'open') throw new Error(`parent task is not open: ${parentTaskId}`)
          const depth = depthOfId(parentTaskId) + 1
          if (depth > maxDepth) throw new Error(`nesting depth ${depth} exceeds maxDepth ${maxDepth}`)
          if (!task.id.startsWith(`${parentTaskId}.`)) throw new Error(`child id must extend parent id: ${task.id}`)
        }
        tasks.set(task.id, {
          ...task,
          parentTaskId,
          state: 'open',
          inherited: false,
        })
        order.push(task.id)
        break
      }
      case 'rename': {
        const task = must(tasks, event.id)
        if (task.state !== 'open') throw new Error(`cannot rename closed task: ${event.id}`)
        task.title = event.title
        break
      }
      case 'complete': {
        const task = must(tasks, event.id)
        if (task.state !== 'open') throw new Error(`cannot close closed task: ${event.id}`)
        if (event.outcome === 'completed') {
          const openChild = order
            .map((id) => tasks.get(id))
            .find((candidate) => candidate.parentTaskId === event.id && candidate.state === 'open')
          if (openChild) throw new Error(`cannot close task ${event.id}: open child ${openChild.id}`)
        }
        task.state = event.outcome
        task.end = event.end
        if (event.outcome === 'abandoned') {
          for (const id of order) {
            const child = tasks.get(id)
            if (child.parentTaskId === event.id && child.state === 'open') child.state = 'abandoned'
          }
        }
        break
      }
      case 'reopen': {
        const task = must(tasks, event.id)
        if (task.state === 'open') throw new Error(`task is already open: ${event.id}`)
        if (task.parentTaskId !== null && tasks.get(task.parentTaskId).state !== 'open') {
          throw new Error(`cannot reopen task ${event.id}: parent is closed`)
        }
        task.state = 'open'
        delete task.end
        break
      }
      case 'partial-compact': {
        const task = must(tasks, event.id)
        if (task.state !== 'open') throw new Error(`cannot partially compress closed task: ${event.id}`)
        task.partialRanges = [...(task.partialRanges ?? []), {
          fromSeq: event.fromSeq,
          toSeq: event.toSeq,
          ...(typeof event.blockId === 'string' ? { blockId: event.blockId } : {}),
        }]
        break
      }
      case 'fork': {
        for (const id of event.inheritedOpenIds) {
          const task = must(tasks, id)
          if (task.state === 'open') task.inherited = true
        }
        break
      }
      case 'compact':
        break
    }
  }
  const openRootId = order
    .map((id) => tasks.get(id))
    .find((task) => task.state === 'open' && task.parentTaskId === null)?.id ?? null
  return { tasks, order, openRootId }
}

/** Surface position of an anchor seq, or -1 when it is no longer visible. */
export function anchorPosition(surfaceNodes, anchorSeq) {
  return surfaceNodes.indexOf(anchorSeq)
}

/**
 * Resolve a boundary to its current surface position, following one or more
 * replacement hops recorded while compaction shadowed the original node.
 * @param surfaceNodes current surface event seqs, in model-visible order
 * @param anchorSeq the boundary's recorded surface-node seq
 * @param replacementOf map of shadowed seq -> replacement seq
 */
export function resolveAnchorPosition(surfaceNodes, anchorSeq, replacementOf = new Map()) {
  let current = anchorSeq
  const seen = new Set()
  while (true) {
    const position = surfaceNodes.indexOf(current)
    if (position !== -1) return position
    if (seen.has(current)) return -1
    seen.add(current)
    const next = replacementOf.get(current)
    if (next === undefined) return -1
    current = next
  }
}

/** Compression state of a task range, derived from surface visibility. */
export function compressionStateFor(task, surfaceNodes, replacementOf = new Map()) {
  if (task.start === undefined) return 'none'
  const start = resolveAnchorPosition(surfaceNodes, task.start.anchorSeq, replacementOf)
  const end = task.end === undefined
    ? surfaceNodes.length - 1
    : resolveAnchorPosition(surfaceNodes, task.end.anchorSeq, replacementOf)
  if (start === -1 || end === -1) return 'full'
  let visible = 0
  for (let position = start; position <= end; position += 1) {
    if (surfaceNodes[position] !== undefined) visible += 1
  }
  return visible === 0 ? 'full' : 'partial'
}
