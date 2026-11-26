import test from 'node:test'
import assert from 'node:assert/strict'
import { frameSummary, shadowedRangeOf, writeBack } from '../src/surface.js'

function fakeSession(seqStart = 10) {
  const calls = []
  let seq = seqStart
  return {
    calls,
    append(type, data, opts) {
      const event = { type, data, opts, seq }
      calls.push(event)
      return { ...event, seq: seq++ }
    },
  }
}

test('shadowedRangeOf resolves positions and rejects stale anchors', () => {
  const nodes = [1, 5, 9, 12]
  assert.deepEqual(shadowedRangeOf(nodes, 5, 12), { start: 5, end: 12, shadowedSeqs: [5, 9, 12] })
  assert.equal(shadowedRangeOf(nodes, 5, 7), undefined)
})

test('writeBack appends the full transaction and replacement in order', () => {
  const session = fakeSession()
  const result = writeBack(session, {
    summary: 'task summary',
    shadowedRange: { start: 5, end: 12, shadowedSeqs: [5, 9, 12] },
    shadowedTokenCount: 42,
  })
  assert.deepEqual(session.calls.map((call) => call.type), [
    'compaction/start', 'compaction/summary', 'user/message', 'compaction/end',
  ])
  const replacement = session.calls[2]
  assert.equal(replacement.opts.surfaceOp.op, 'replace')
  assert.deepEqual(replacement.opts.surfaceOp, { op: 'replace', startSeq: 5, endSeq: 12 })
  assert.deepEqual(replacement.opts.sourceEventSeqs, [10, 11, 5, 9, 12])
  assert.equal(replacement.data.source.kind, 'compact-checkpoint')
  assert.deepEqual(session.calls[1].data.shadowedRange, { start: 5, end: 12 })
  assert.equal(result.compactionId, replacement.data.source.compactionId)
})

test('summary framing matches the durable checkpoint tags', () => {
  const blocks = frameSummary('hello')
  assert.match(blocks[0].text, /<compacted-summary>$/)
  assert.deepEqual(blocks[1], { type: 'text', text: 'hello' })
  assert.equal(blocks[2].text, '</compacted-summary>')
})
