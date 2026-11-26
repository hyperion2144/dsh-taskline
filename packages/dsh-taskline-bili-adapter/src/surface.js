/**
 * Mirror one bili compression into the DSH session surface.
 *
 * bili substitutes compressed content on the wire only; its proxy keeps the
 * original DSH context. If the proxy disappears, the host falls back to that
 * original context. Writing the same summary as a DSH compaction transaction
 * keeps the host context small so the fallback cannot overflow.
 */

const PREAMBLE = 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.'

/** Frame summary text the same way DSH's compaction backend frames it. */
export function frameSummary(summaryText) {
  return [
    { type: 'text', text: `${PREAMBLE}\n\n<compacted-summary>` },
    { type: 'text', text: summaryText },
    { type: 'text', text: '</compacted-summary>' },
  ]
}

/** Surface positions for one [startSeq, endSeq] anchor pair, or undefined when stale. */
export function shadowedRangeOf(surfaceNodes, startSeq, endSeq) {
  const start = surfaceNodes.indexOf(startSeq)
  const end = surfaceNodes.indexOf(endSeq)
  if (start === -1 || end === -1 || end < start) return undefined
  return {
    start: surfaceNodes[start],
    end: surfaceNodes[end],
    shadowedSeqs: surfaceNodes.slice(start, end + 1),
  }
}

/**
 * Append the full DSH compaction transaction for one already-applied range.
 * @returns {{compactionId: string, startSeq: number, summarySeq: number, endSeq: number, shadowedSeqs: number[]}}
 */
export function writeBack(session, { summary, provider = 'bili', model = 'billion-context', shadowedRange, shadowedTokenCount = 0, turn = null }) {
  const compactionId = globalThis.crypto.randomUUID()
  const start = shadowedRange.start
  const end = shadowedRange.end
  const shadowedSeqs = [...shadowedRange.shadowedSeqs]
  const startEvent = session.append('compaction/start', { compactionId, turn })
  const summaryEvent = session.append('compaction/summary', {
    compactionId,
    summary: [{ type: 'text', text: String(summary) }],
    shadowedRange: { start, end },
    shadowedSeqs,
    shadowedTokenCount,
    provider,
    model,
  })
  const checkpoint = {
    id: globalThis.crypto.randomUUID(),
    role: 'user',
    content: frameSummary(String(summary)),
    source: { kind: 'compact-checkpoint', compactionId },
  }
  session.append('user/message', checkpoint, {
    surfaceOp: { op: 'replace', startSeq: start, endSeq: end },
    sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...shadowedSeqs],
  })
  const endEvent = session.append('compaction/end', { compactionId, turn })
  return { compactionId, startSeq: startEvent.seq, summarySeq: summaryEvent.seq, endSeq: endEvent.seq, shadowedSeqs }
}
