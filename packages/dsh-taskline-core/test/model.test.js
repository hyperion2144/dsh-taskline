import test from 'node:test'
import assert from 'node:assert/strict'
import {
  foldTaskEvents,
  validateEvent,
  depthOfId,
  resolveAnchorPosition,
  compressionStateFor,
} from '../src/model.js'

const start = (atSeq, anchorSeq = atSeq) => ({ atSeq, anchorSeq })
const create = (id, parentTaskId = null) => ({
  op: 'create',
  task: { id, title: `task ${id}`, parentTaskId, autoCreated: false, start: start(1) },
})

test('create / rename / complete / reopen folds into one task', () => {
  const { tasks, order } = foldTaskEvents([
    create('t-1'),
    { op: 'rename', id: 't-1', title: '引擎接管' },
    { op: 'complete', id: 't-1', outcome: 'completed', end: start(9) },
    { op: 'reopen', id: 't-1' },
  ])
  assert.deepEqual(order, ['t-1'])
  const task = tasks.get('t-1')
  assert.equal(task.title, '引擎接管')
  assert.equal(task.state, 'open')
  assert.equal(task.end, undefined)
})

test('closing a task with an open child is rejected', () => {
  assert.throws(
    () => foldTaskEvents([create('t-1'), create('t-1.1', 't-1'), { op: 'complete', id: 't-1', outcome: 'completed', end: start(9) }], { maxDepth: 2 }),
    /open child/,
  )
})

test('nesting honours maxDepth and id prefix', () => {
  assert.throws(() => foldTaskEvents([create('t-1'), create('t-1.1', 't-1')], { maxDepth: 0 }), /exceeds maxDepth/)
  assert.throws(() => foldTaskEvents([create('t-1'), create('t-2.1', 't-1')], { maxDepth: 2 }), /extend parent id/)
  const { tasks } = foldTaskEvents([create('t-1'), create('t-1.1', 't-1')], { maxDepth: 1 })
  assert.equal(tasks.get('t-1.1').parentTaskId, 't-1')
})

test('abandoning a parent cascades open children', () => {
  const { tasks } = foldTaskEvents([
    create('t-1'),
    create('t-1.1', 't-1'),
    { op: 'complete', id: 't-1', outcome: 'abandoned', end: start(9) },
  ], { maxDepth: 2 })
  assert.equal(tasks.get('t-1').state, 'abandoned')
  assert.equal(tasks.get('t-1.1').state, 'abandoned')
})

test('reopening under a closed parent is rejected', () => {
  assert.throws(() => foldTaskEvents([
    create('t-1'),
    create('t-1.1', 't-1'),
    { op: 'complete', id: 't-1.1', outcome: 'completed', end: start(5) },
    { op: 'complete', id: 't-1', outcome: 'completed', end: start(9) },
    { op: 'reopen', id: 't-1.1' },
  ], { maxDepth: 2 }), /parent is closed/)
})

test('fork marks inherited open tasks', () => {
  const { tasks } = foldTaskEvents([create('t-1'), { op: 'fork', inheritedOpenIds: ['t-1'] }])
  assert.equal(tasks.get('t-1').inherited, true)
})

test('depthOfId and validateEvent reject malformed input', () => {
  assert.equal(depthOfId('t-1'), 0)
  assert.equal(depthOfId('t-1.2.3'), 2)
  assert.throws(() => validateEvent({ op: 'nope' }), /unknown taskline op/)
  assert.throws(() => validateEvent({ op: 'create', task: { id: 'x', title: 't', start: start(1) } }), /invalid task id/)
})

test('anchors resolve through replacement hops and report loss', () => {
  const surface = [2, 7, 11]
  assert.equal(resolveAnchorPosition(surface, 7), 1)
  const hops = new Map([[5, 9], [9, 7]])
  assert.equal(resolveAnchorPosition(surface, 5, hops), 1)
  assert.equal(resolveAnchorPosition(surface, 99), -1)
})

test('compression state derives from visibility', () => {
  const surface = [1, 2, 3]
  const task = { start: start(1, 1), end: start(3, 3) }
  assert.equal(compressionStateFor(task, surface), 'partial')
  assert.equal(compressionStateFor({ start: start(1, 99), end: start(3, 3) }, surface), 'full')
})
