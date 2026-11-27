/**
 * Session projection for taskline: folds taskline plugin records into the
 * client-visible task tree (`useProjection('taskline')` on the client).
 */
import { z } from 'zod'

import { TASK_EVENT_TYPE } from './model.js'
import { tasklineWire } from './projection-view.js'

export const TASKLINE_PROJECTION = 'taskline'

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  state: z.string(),
  parentTaskId: z.string().nullable(),
  startSeq: z.number(),
  endSeq: z.number().nullable(),
  autoCreated: z.boolean(),
  inherited: z.boolean(),
  partialRanges: z.array(z.object({
    fromSeq: z.number(),
    toSeq: z.number(),
    blockId: z.string().optional(),
  })),
})

const compactionSchema = z.object({
  backend: z.string(),
  outcome: z.string(),
  fromSeq: z.number().nullable(),
  toSeq: z.number().nullable(),
  taskIds: z.array(z.string()),
  requested: z.array(z.string()),
  kept: z.array(z.string()),
  skipped: z.array(z.string()),
  atSeq: z.number().nullable(),
  summary: z.string(),
  reason: z.string(),
  beforeTokens: z.number().nullable(),
  afterTokens: z.number().nullable(),
  partial: z.array(z.string()),
})

const wireSchema = z.object({
  openRootId: z.string().nullable(),
  tasks: z.array(taskSchema),
  compactions: z.array(compactionSchema),
})

const stateSchema = z.object({ events: z.array(z.unknown()) })

/** Build the projection definition registered by the host half. */
export function tasklineProjection() {
  return {
    key: TASKLINE_PROJECTION,
    stateSchema,
    stateVersion: 2,
    init: () => ({ events: [] }),
    apply(state, event) {
      if (event.type !== TASK_EVENT_TYPE) return state
      return { events: [...state.events, event.data] }
    },
    wire: {
      viewSchema: wireSchema,
      view: (state) => tasklineWire(state.events),
    },
  }
}
