import test from 'node:test'
import assert from 'node:assert/strict'
import { planRanges } from '../src/plan.js'

const surface = [1, 3, 5, 7, 9, 11]
const task = (id, state, startSeq, endSeq) => ({ id, state, startSeq, endSeq })

test('keeps the newest tasksLater closed tasks verbatim', () => {
  const plan = planRanges({ surface, tasks: [task('t-1', 'completed', 1, 3), task('t-2', 'completed', 5, 7)], tasksLater: 1 })
  assert.deepEqual(plan, [{ start: 1, end: 3, taskIds: ['t-1'] }])
})

test('never compacts an open task and splits around it', () => {
  const plan = planRanges({
    surface,
    tasks: [task('t-1', 'completed', 1, 9), task('t-2', 'open', 3, 5)],
    tasksLater: 0,
  })
  assert.deepEqual(plan, [{ start: 7, end: 9, taskIds: ['t-1'] }])
})

test('ignores ranges outside the live surface', () => {
  const plan = planRanges({ surface, tasks: [task('t-1', 'completed', 100, 200)], tasksLater: 0 })
  assert.deepEqual(plan, [])
})
