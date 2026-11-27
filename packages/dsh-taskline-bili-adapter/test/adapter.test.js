import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../src/index.js'

function fakeContext({ runtime, foldBlocks, taskline }) {
  let service
  const handlers = {}
  const ctx = {
    get: (name) => (name === 'bili:runtime' ? runtime : name === 'tokenMeter' ? { measure: () => ({ nodes: [] }) } : name === 'taskline:foldBlocks' ? foldBlocks : name === 'taskline' ? taskline : undefined),
    inject: (_names, callback) => callback({ tools: { get: () => undefined, register: () => undefined } }),
    on: (name, callback) => { handlers[name] = callback },
    provide: (name, value) => { service = value },
    taskline,
  }
  apply(ctx)
  assert.ok(service)
  return { service, fire: (name, payload) => handlers[name]?.(payload) }
}

function fakeSession() {
  const appended = []
  let seq = 100
  return {
    id: 'session-test',
    surface: { nodes: [1, 5, 9] },
    appended,
    append(type, data, opts) {
      appended.push({ type, data, opts })
      return { type, data, seq: seq++ }
    },
  }
}

test('an applied bili range is written back as a full DSH compaction transaction', async () => {
  const notified = []
  const runtime = {
    available: async () => true,
    client: {
      snapshot: async () => ({
        parentRevision: 7,
        orderedMessages: [
          { rawId: 'msg-a', ref: 'm00001' },
          { rawId: 'msg-b', ref: 'm00002' },
        ],
      }),
      compress: async () => ({ outcome: 'applied', result: 'ok' }),
      notifyCompacted: async (id) => notified.push(id),
    },
  }
  const { service, fire } = fakeContext({ runtime })
  const session = fakeSession()
  const boundaries = new Map([['t-1', { title: 'demo', summary: 'demo', startMessageId: 'msg-a', endMessageId: 'msg-b', startSeq: 1, endSeq: 9 }]])
  const result = await service.compressRanges(session, boundaries, [{ start: 1, end: 9, taskIds: ['t-1'] }])
  assert.equal(result.outcome, 'ok')
  assert.equal(result.deferred, 1)
  assert.equal(session.appended.length, 0)
  await fire('agent/turn-stopping', { agent: { session } })
  assert.deepEqual(session.appended.map((event) => event.type), [
    'compaction/start', 'compaction/summary', 'user/message', 'compaction/end',
  ])
  assert.deepEqual(notified, ['session-test'])
})

test('an unavailable proxy skips without touching the surface', async () => {
  const { service } = fakeContext({ runtime: { available: async () => false, client: {} } })
  const session = fakeSession()
  const result = await service.compressRanges(session, new Map(), [])
  assert.equal(result.reason, 'bili-unavailable')
  assert.equal(session.appended.length, 0)
})


test('status reports availability and compressible range count', async () => {
  const runtime = {
    available: async () => true,
    client: { status: async () => ({ contextTokens: 1234, contextLimit: 64000, compressibleRanges: [{}, {}] }) },
  }
  const { service } = fakeContext({ runtime })
  const status = await service.status({ id: 'session-test' })
  assert.deepEqual(status, { available: true, contextTokens: 1234, contextLimit: 64000, compressibleRanges: 2 })
})


test('a new bili fold is mirrored into the DSH surface', async () => {
  const appended = []
  const runtime = {
    available: async () => true,
    client: {
      snapshot: async () => ({
        parentRevision: 7,
        messages: [
          { rawId: 'h_c', role: 'assistant', text: 'C' },
          { rawId: 'h_d', role: 'assistant', text: 'D' },
        ],
      }),
    },
  }
  const { fire } = fakeContext({ runtime, foldBlocks: () => [{ blockId: 'b1', summary: 'BILI SUMMARY', messageIds: ['h_c', 'h_d'], compressedTokens: 100 }] })
  const events = [
    { 1: { type: 'user/message', data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'A' }] } } },
    { 2: { type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'B' }] } } },
    { 3: { type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'C' }] } } },
    { 4: { type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'D' }] } } },
  ]
  const bySeq = new Map(events.map((entry) => { const [seq, event] = Object.entries(entry)[0]; return [Number(seq), event] }))
  const session = {
    id: 'session-fold',
    surface: { nodes: [1, 2, 3, 4] },
    eventAt: (seq) => bySeq.get(seq),
    append: (type, data, opts) => { appended.push({ type, data, opts }); return { type, data, seq: appended.length } },
  }
  await fire('agent/turn-stopping', { agent: { session } })
  assert.ok(appended.some((event) => event.type === 'compaction/start'))
  assert.ok(appended.some((event) => event.type === 'compaction/summary'))
  const summary = appended.find((event) => event.type === 'compaction/summary')
  assert.match(JSON.stringify(summary.data), /BILI SUMMARY/)
})


test('a fold covering an open task is written back and marked partial', async () => {
  const appended = []
  const taskline = {
    treeOf: () => ({
      order: ['t-1'],
      tasks: new Map([['t-1', { id: 't-1', title: 'open', state: 'open', start: { anchorSeq: 1 }, end: undefined }]]),
    }),
    append: (_session, event) => appended.push(event),
  }
  const runtime = {
    available: async () => true,
    client: {
      snapshot: async () => ({
        parentRevision: 7,
        messages: [
          { rawId: 'h_c', role: 'assistant', text: 'C' },
          { rawId: 'h_d', role: 'assistant', text: 'D' },
        ],
      }),
    },
  }
  const { fire } = fakeContext({
    runtime,
    taskline,
    foldBlocks: () => [{ blockId: 'b1', summary: 'PARTIAL SUMMARY', messageIds: ['h_c', 'h_d'], compressedTokens: 100 }],
  })
  const bySeq = new Map([
    [1, { type: 'user/message', data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'A' }] } }],
    [2, { type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'B' }] } }],
    [3, { type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'C' }] } }],
    [4, { type: 'assistant/message', data: { role: 'assistant', content: [{ type: 'text', text: 'D' }] } }],
  ])
  const session = {
    id: 'session-open',
    surface: { nodes: [1, 2, 3, 4] },
    eventAt: (seq) => bySeq.get(seq),
    append: (type, data) => ({ type, data, seq: 1 }),
  }
  await fire('agent/turn-stopping', { agent: { session } })
  const compact = appended.find((event) => event.op === 'compact')
  assert.equal(compact.outcome, 'ok')
  assert.deepEqual(compact.partial, ['t-1'])
  const partial = appended.find((event) => event.op === 'partial-compact')
  assert.deepEqual({ id: partial.id, fromSeq: partial.fromSeq, toSeq: partial.toSeq }, { id: 't-1', fromSeq: 3, toSeq: 4 })
})
