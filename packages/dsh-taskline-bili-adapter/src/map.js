/**
 * Pure mapping from taskline ranges to bili refs.
 *
 * A task boundary carries the DSH message id at its surface anchor; when bili's
 * msgid pin succeeded, snapshot rawId equals that id. A protected entry has
 * ref null and is never addressable, so its range must be skipped verbatim.
 */

/** Drop a leading range-header line the model may have copied from bili guidance. */
export function sanitizeSummary(summary) {
  const lines = String(summary ?? '').split('\n')
  while (lines.length > 0 && /^\s*m\d{5,}\s*[–—\-…~]{1,3}\s*m\d{5,}/.test(lines[0])) lines.shift()
  return lines.join('\n').trim()
}

/** Walk the ordered wire messages outward until an addressable ref appears. */
function nearestRef(ordered, messageId, forward) {
  if (!Array.isArray(ordered) || ordered.length === 0) return undefined
  const index = ordered.findIndex((entry) => entry?.rawId === messageId)
  if (index === -1) return undefined
  const step = forward ? 1 : -1
  for (let cursor = index; cursor >= 0 && cursor < ordered.length; cursor += step) {
    const ref = ordered[cursor]?.ref
    if (typeof ref === 'string' && ref.length > 0) return ref
  }
  return undefined
}

function boundaryRef(refsByRaw, ordered, messageId, forward) {
  if (messageId === undefined) return undefined
  const direct = refsByRaw.get(messageId)
  if (typeof direct === 'string' && direct.length > 0) return direct
  return nearestRef(ordered, messageId, forward)
}

/** Build the single compress content string; unaddressable ranges are skipped. */
export function buildCompressContent({ ranges, taskBoundaries, refsByRaw, ordered }) {
  const lines = []
  const skipped = []
  for (const range of ranges) {
    const start = taskBoundaries.get(range.taskIds[0])
    const end = taskBoundaries.get(range.taskIds[range.taskIds.length - 1])
    const startRef = boundaryRef(refsByRaw, ordered, start?.startMessageId, true)
    const endRef = boundaryRef(refsByRaw, ordered, end?.endMessageId, false)
    if (startRef === undefined || endRef === undefined) {
      skipped.push({ taskIds: range.taskIds, reason: 'unmapped-or-protected-boundary' })
      continue
    }
    const title = start?.title ?? range.taskIds[0]
    lines.push(`${startRef}–${endRef} ${title}\n## 摘要\n${start?.summary ?? title}`)
  }
  return { content: lines.join('\n'), skipped }
}
