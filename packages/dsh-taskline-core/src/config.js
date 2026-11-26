/**
 * taskline-core configuration schema (schemastery) and defaults.
 *
 * The loader validates the profile entry config against this schema; the same
 * defaults back the plugin when the entry omits config entirely.
 */
import z from '@deepseek-ai/schemastery'

export const DEFAULTS = {
  autoCreate: { enabled: true, thresholdCalls: 3 },
  nesting: { maxDepth: 0 },
  compaction: { enabled: true, backend: 'auto', compressor: 'bili', thresholdRatio: 0.8, contextLimit: 0, tasksLater: 2, notifyOnClamp: true },
  reminder: { enabled: true, thresholdTokens: 50000, cooldownMinutes: 10 },
}

export const Config = z.object({
  autoCreate: z
    .object({
      enabled: z.boolean().volatile().default(DEFAULTS.autoCreate.enabled),
      thresholdCalls: z.number().volatile().step(1).min(1).max(20).default(DEFAULTS.autoCreate.thresholdCalls),
    })
    .default(DEFAULTS.autoCreate),
  nesting: z
    .object({
      maxDepth: z.number().volatile().step(1).min(0).max(5).default(DEFAULTS.nesting.maxDepth),
    })
    .default(DEFAULTS.nesting),
  compaction: z
    .object({
      enabled: z.boolean().volatile().default(DEFAULTS.compaction.enabled),
      backend: z.string().default(DEFAULTS.compaction.backend).volatile(),
      compressor: z.string().default(DEFAULTS.compaction.compressor).volatile(),
      thresholdRatio: z.number().volatile().min(0.1).max(1).default(DEFAULTS.compaction.thresholdRatio),
      contextLimit: z.number().volatile().step(1).min(0).max(10000000).default(DEFAULTS.compaction.contextLimit),
      tasksLater: z.number().volatile().step(1).min(1).max(10).default(DEFAULTS.compaction.tasksLater),
      notifyOnClamp: z.boolean().volatile().default(DEFAULTS.compaction.notifyOnClamp),
    })
    .default(DEFAULTS.compaction),
  reminder: z
    .object({
      enabled: z.boolean().volatile().default(DEFAULTS.reminder.enabled),
      thresholdTokens: z.number().volatile().step(1).min(1000).max(1000000).default(DEFAULTS.reminder.thresholdTokens),
      cooldownMinutes: z.number().volatile().step(1).min(1).max(1440).default(DEFAULTS.reminder.cooldownMinutes),
    })
    .default(DEFAULTS.reminder),
})

/** Merge user config over defaults, keeping unknown sections untouched. */
export function resolveConfig(config) {
  const value = config === undefined || config === null ? {} : config
  return {
    autoCreate: { ...DEFAULTS.autoCreate, ...(value.autoCreate ?? {}) },
    nesting: { ...DEFAULTS.nesting, ...(value.nesting ?? {}) },
    compaction: { ...DEFAULTS.compaction, ...(value.compaction ?? {}) },
    reminder: { ...DEFAULTS.reminder, ...(value.reminder ?? {}) },
  }
}
