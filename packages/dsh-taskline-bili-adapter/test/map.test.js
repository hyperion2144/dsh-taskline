import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCompressContent } from '../src/map.js'

test('maps boundaries through rawId refs', () => {
  const refsByRaw = new Map([['msg-a', 'm00001'], ['msg-b', 'm00009']])
  const taskBoundaries = new Map([['t-1', { title: 'demo', startMessageId: 'msg-a', endMessageId: 'msg-b' }]])
  const { content, skipped } = buildCompressContent({
    ranges: [{ taskIds: ['t-1'], start: 1, end: 9 }],
    taskBoundaries,
    refsByRaw,
  })
  assert.equal(skipped.length, 0)
  assert.match(content, /^m00001–m00009 demo/)
})

test('protected or unmapped boundaries are skipped, never guessed', () => {
  const refsByRaw = new Map([['msg-a', 'm00001'], ['msg-b', null]])
  const taskBoundaries = new Map([['t-1', { title: 'demo', startMessageId: 'msg-a', endMessageId: 'msg-b' }]])
  const { content, skipped } = buildCompressContent({
    ranges: [{ taskIds: ['t-1'], start: 1, end: 9 }],
    taskBoundaries,
    refsByRaw,
  })
  assert.equal(content, '')
  assert.deepEqual(skipped, [{ taskIds: ['t-1'], reason: 'unmapped-or-protected-boundary' }])
})


test('a leading ref header in the model summary is stripped', async () => {
  const { sanitizeSummary } = await import('../src/map.js')
  assert.equal(sanitizeSummary('m00017–m00037 big\n## 摘要\nhello'), '## 摘要\nhello')
  assert.equal(sanitizeSummary('plain summary'), 'plain summary')
})
