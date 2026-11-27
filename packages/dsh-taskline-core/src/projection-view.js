/**
 * Pure wire view for the taskline session projection.
 *
 * The projection state keeps the raw taskline events; this function derives the
 * client-visible task tree without importing any DSH or schema dependency.
 */
import { foldTaskEvents } from './model.js'

/** Build the client wire value from the raw projected events. */
export function tasklineWire(events, maxDepth = 0) {
  if (!Array.isArray(events) || events.length === 0) return { openRootId: null, tasks: [], compactions: [] }
  const taskEvents = events.filter((event) => event?.op !== 'compact')
  const { order, tasks, openRootId } = foldTaskEvents(taskEvents, { maxDepth })
  const compactions = events
    .filter((event) => event?.op === 'compact')
    .slice(-20)
    .map((event) => ({
      backend: String(event.backend ?? 'native'),
      outcome: String(event.outcome ?? 'skipped'),
      fromSeq: Number.isFinite(event.fromSeq) ? event.fromSeq : null,
      toSeq: Number.isFinite(event.toSeq) ? event.toSeq : null,
      taskIds: Array.isArray(event.taskIds) ? event.taskIds.map(String) : [],
      requested: Array.isArray(event.requested) ? event.requested.map(String) : [],
      kept: Array.isArray(event.kept) ? event.kept.map(String) : [],
      skipped: Array.isArray(event.skipped) ? event.skipped.map(String) : [],
      atSeq: Number.isFinite(event.atSeq) ? event.atSeq : null,
      summary: typeof event.summary === 'string' ? event.summary : '',
      reason: typeof event.reason === 'string' ? event.reason : '',
      beforeTokens: Number.isFinite(event.beforeTokens) ? event.beforeTokens : null,
      afterTokens: Number.isFinite(event.afterTokens) ? event.afterTokens : null,
      partial: Array.isArray(event.partial) ? event.partial.map(String) : [],
    }))
  return {
    openRootId,
    tasks: order.map((id) => {
      const task = tasks.get(id)
      return {
        id: task.id,
        title: task.title,
        state: task.state,
        parentTaskId: task.parentTaskId,
        startSeq: task.start.anchorSeq,
        endSeq: task.end?.anchorSeq ?? null,
        autoCreated: task.autoCreated === true,
        inherited: task.inherited === true,
        partialRanges: Array.isArray(task.partialRanges) ? task.partialRanges.map((range) => ({ fromSeq: range.fromSeq, toSeq: range.toSeq, ...(typeof range.blockId === 'string' ? { blockId: range.blockId } : {}) })) : [],
      }
    }),
    compactions,
  }
}
