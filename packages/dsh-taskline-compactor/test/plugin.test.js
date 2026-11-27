import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../src/index.js'

function fakeTree(tasks) {
  const map = new Map(tasks.map((task) => [task.id, task]))
  return { order: tasks.map((task) => task.id), tasks: map, openRootId: null }
}

function setup({ tasks, engine }) {
  const appended = []
  const handlers = {}
  const ctx = {
    taskline: {
      treeOf: () => fakeTree(tasks),
      append: (_session, event) => appended.push(event),
      config: () => ({ enabled: true, tasksLater: 2, thresholdRatio: 0.8 }),
    },
    get: () => undefined,
    inject: (names, callback) => {
      callback({
        agentPresets: { serviceFor: () => engine },
        commands: { register: () => undefined },
        tokenMeter: { measure: () => ({ totalTokens: 0 }) },
        tools: { register: () => undefined },
      })
    },
    on: (name, handler) => { handlers[name] = handler },
  }
  apply(ctx)
  return { appended, handlers }
}

const session = { seq: 20, surface: { nodes: [1, 3, 5, 7, 9, 11] } }
const agent = { session }

test('a closed task older than tasksLater triggers native compaction', async () => {
  const calls = []
  const { appended, handlers } = setup({
    tasks: [
      { id: 't-1', title: 'a', state: 'completed', start: { anchorSeq: 1 }, end: { anchorSeq: 3 } },
      { id: 't-2', title: 'b', state: 'completed', start: { anchorSeq: 5 }, end: { anchorSeq: 7 } },
      { id: 't-3', title: 'c', state: 'completed', start: { anchorSeq: 9 }, end: { anchorSeq: 11 } },
    ],
    engine: { compactRegion: async (start, end) => { calls.push([start, end]) } },
  })
  await handlers['tools/post-execute']({ name: 'task_complete', agent }, {}, async () => ({}))
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(calls, [[1, 3]])
  assert.equal(appended.length, 1)
  assert.equal(appended[0].op, 'compact')
  assert.equal(appended[0].outcome, 'ok')
  assert.deepEqual(appended[0].taskIds, ['t-1'])
})

test('a failed compactRegion is recorded as failed', async () => {
  const { appended, handlers } = setup({
    tasks: [
      { id: 't-1', title: 'a', state: 'completed', start: { anchorSeq: 1 }, end: { anchorSeq: 3 } },
      { id: 't-2', title: 'b', state: 'completed', start: { anchorSeq: 5 }, end: { anchorSeq: 7 } },
      { id: 't-3', title: 'c', state: 'completed', start: { anchorSeq: 9 }, end: { anchorSeq: 11 } },
    ],
    engine: { compactRegion: async () => { throw new Error('unbalanced') } },
  })
  await handlers['tools/post-execute']({ name: 'task_abandon', agent }, {}, async () => ({}))
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(appended.length, 1)
  assert.equal(appended[0].outcome, 'failed')
})
