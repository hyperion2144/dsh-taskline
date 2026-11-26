import test from 'node:test'
import assert from 'node:assert/strict'
import { tasklineWire } from '../src/projection-view.js'

const create = (id, title, atSeq) => ({
  op: 'create',
  task: { id, title, parentTaskId: null, autoCreated: false, start: { atSeq, anchorSeq: atSeq } },
})

test('empty events produce an empty wire value', () => {
  assert.deepEqual(tasklineWire([]), { openRootId: null, tasks: [], compactions: [] })
})

test('wire value carries state, title, and boundaries', () => {
  const wire = tasklineWire([
    create('t-1', 'first', 1),
    { op: 'complete', id: 't-1', outcome: 'completed', end: { atSeq: 5, anchorSeq: 5 } },
    create('t-2', 'second', 6),
  ])
  assert.equal(wire.openRootId, 't-2')
  assert.equal(wire.tasks.length, 2)
  assert.equal(wire.tasks[0].state, 'completed')
  assert.equal(wire.tasks[0].endSeq, 5)
  assert.equal(wire.tasks[1].title, 'second')
})

test('nesting is reflected in the wire value', () => {
  const wire = tasklineWire([
    create('t-1', 'root', 1),
    { op: 'create', task: { id: 't-1.1', title: 'child', parentTaskId: 't-1', autoCreated: false, start: { atSeq: 2, anchorSeq: 2 } } },
  ], 2)
  assert.equal(wire.tasks[1].parentTaskId, 't-1')
})
