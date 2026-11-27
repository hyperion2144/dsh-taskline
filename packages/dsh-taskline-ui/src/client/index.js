/**
 * taskline web client: composer dock + taskline tool cards.
 * Styling uses only --dsw-* design tokens.
 */
import { createElement as h, useState, useSyncExternalStore } from 'react'
import { Button, Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'

export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight', 'connection', 'configForms']

const TOOL_NAMES = ['task_start', 'task_rename', 'task_complete', 'task_abandon', 'task_reopen', 'task_compress', 'task_bili_status', 'compress']

function formatTokens(value) {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(Math.round(value))
}

const CSS = [
  '.taskline-dock{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));margin:0 auto 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);padding:8px 10px;display:flex;flex-direction:column;gap:6px}',
  '.taskline-dock *{box-sizing:border-box}',
  '.taskline-row{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:12px;min-width:0}',
  '.taskline-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}',
  '.taskline-dot.is-done{background:var(--dsw-alias-state-done-primary)}',
  '.taskline-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.taskline-count{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
  '.taskline-toggle{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;font-size:11px;padding:1px 7px;cursor:pointer}',
  '.taskline-bar{display:flex;height:6px;gap:2px}',
  '.taskline-bar span{border-radius:999px;height:100%}',
  '.taskline-bar .is-done{background:var(--dsw-alias-state-done-primary)}',
  '.taskline-bar .is-active{background:var(--dsw-alias-brand-primary)}',
  '.taskline-bar .is-idle{background:var(--dsw-alias-bg-layer-3)}',
  '.taskline-tool{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;margin:6px 0}',
  '.taskline-tool-head{display:flex;gap:8px;align-items:center;padding:6px 10px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.taskline-tool-toggle{width:100%;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;text-align:left}',
  '.taskline-tool-state{flex:none;color:var(--dsw-alias-label-secondary)}',
  '.taskline-tool-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}',
  '.taskline-tool-action{flex:none;color:var(--dsw-alias-brand-primary)}',
  '.taskline-tool-name{color:var(--dsw-alias-brand-primary);font-family:ui-monospace,Menlo,Consolas,monospace}',
  '.taskline-tool-body{margin:0;padding:8px 10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-primary);max-height:160px;overflow:auto;white-space:pre-wrap}',
  '.taskline-panel-head-row{display:flex;align-items:center;justify-content:space-between;gap:8px}',
  '.taskline-panel-title{font-weight:600;color:var(--dsw-alias-label-primary);font-size:12px}',
  '.taskline-progress{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}',
  '.taskline-progress span{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width 160ms ease}',
  '.taskline-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-label-tertiary)}',
  '.taskline-dot.is-active{background:var(--dsw-alias-brand-primary)}',
  '.taskline-dot.is-done{background:var(--dsw-alias-state-done-primary)}',
  '.taskline-dot.is-idle{background:var(--dsw-alias-label-tertiary)}',
  '.taskline-chip{flex:none;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;padding:0 6px;line-height:16px}',
  '.taskline-badge{display:inline-flex;align-items:center;gap:4px;flex:none;border-radius:999px;padding:1px 8px;font-size:10.5px;line-height:16px;font-variant-numeric:tabular-nums;border:1px solid transparent;cursor:pointer}',
  '.taskline-badge.is-done{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}',
  '.taskline-badge.is-partial{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent)}',
  '.taskline-badge.is-failed{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);cursor:default}',
  '.taskline-summary{margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-size:11.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}',
  '.taskline-node[data-compression=done]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 26%,var(--dsw-alias-border-l1))}',
  '.taskline-node[data-compression=failed]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 26%,var(--dsw-alias-border-l1))}',
  '.taskline-panel{padding:10px;display:flex;flex-direction:column;gap:8px}',
  '.taskline-panel-head{color:var(--dsw-alias-label-secondary);font-size:11px}',
  '.taskline-tree{display:flex;flex-direction:column;gap:4px}',
  '.taskline-node{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:6px 8px;display:flex;flex-direction:column;gap:3px}',
  '.taskline-node-row{display:flex;align-items:center;gap:6px;min-width:0}',
  '.taskline-node-title{font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}',
  '.taskline-node-meta{color:var(--dsw-alias-label-secondary);font-size:10.5px;font-family:ui-monospace,Menlo,Consolas,monospace}',
  '.taskline-children{padding-left:12px;border-left:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:4px;margin-left:4px}',
  '.taskline-empty{color:var(--dsw-alias-label-tertiary);font-size:11px;padding:8px 2px}',
  '.taskline-input{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11px;padding:2px 6px;min-width:0;flex:1}',
  '.taskline-field{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11px}',
  '.taskline-field input[type=number]{width:64px}',
].join('')

function installStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-taskline]') !== null) return
  const style = document.createElement('style')
  style.dataset.taskline = '1'
  style.textContent = CSS
  document.head.append(style)
}

function Dock({ useProjection, openTree }) {
  const [collapsed, setCollapsed] = useState(false)
  const view = useProjection('taskline')
  if (view === null || view === undefined || !Array.isArray(view.tasks) || view.tasks.length === 0) return null
  const total = view.tasks.length
  const done = view.tasks.filter((task) => task.state !== 'open').length
  const open = view.tasks.find((task) => task.id === view.openRootId) ?? view.tasks.find((task) => task.state === 'open')
  const title = open?.title ?? '任务'
  const active = open === undefined ? 0 : 1
  const idle = Math.max(0, total - done - active)
  const pct = (count) => `${total === 0 ? 0 : (count / total) * 100}%`
  return h('div', { className: 'taskline-dock' },
    h('div', { className: 'taskline-row' },
      h('span', { className: `taskline-dot${open === undefined ? ' is-done' : ''}` }),
      h('span', { className: 'taskline-title' }, title),
      h('span', { className: 'taskline-count' }, `${done}/${total}`),
      h('button', { type: 'button', className: 'taskline-toggle', onClick: () => openTree?.() }, '任务树'),
      h('button', {
        type: 'button',
        className: 'taskline-toggle',
        'aria-expanded': String(!collapsed),
        onClick: () => setCollapsed((value) => !value),
      }, collapsed ? '展开' : '收起'),
    ),
    collapsed ? null : h('div', { className: 'taskline-bar' },
      h('span', { className: 'is-done', style: { width: pct(done) } }),
      h('span', { className: 'is-active', style: { width: pct(active) } }),
      h('span', { className: 'is-idle', style: { width: pct(idle) } }),
    ),
  )
}

function payloadText(props) {
  if (props.phase === 'result') {
    const content = props.block?.content
    if (Array.isArray(content)) {
      const text = content.map((part) => (part?.type === 'text' ? part.text : '')).join('\n')
      if (text.length > 0) return text.slice(0, 2000)
    }
    return JSON.stringify(props.block ?? {}, null, 2).slice(0, 2000)
  }
  return JSON.stringify(props.block?.args ?? {}, null, 2).slice(0, 2000)
}

function ToolCard(props) {
  const name = props.block?.name ?? props.toolName ?? 'task'
  const args = props.block?.args ?? {}
  const detail = payloadText(props)
  const [open, setOpen] = useState(false)
  let state = props.phase === 'result' ? '完成' : '执行中'
  let title = ''
  if (name === 'task_start' && typeof args.title === 'string') {
    title = `任务：${args.title}`
  } else if (name === 'task_compress' || name === 'compress') {
    const tasks = Array.isArray(args.tasks) ? args.tasks : []
    const described = tasks.length > 0
      ? tasks.map((task) => {
          const summary = String(task?.summary ?? '').split('\n')[0].trim()
          const head = summary.length > 0 ? summary.slice(0, 36) : '摘要'
          return `${String(task?.taskId ?? '?')} · ${head}`
        }).join('；')
      : ''
    title = described
    if (props.phase === 'result') {
      try {
        const parsed = JSON.parse(detail)
        if (typeof parsed?.outcome === 'string') {
          const applied = Number(parsed?.applied ?? 0)
          state = `${parsed.outcome}${applied > 0 ? ` · 已压缩 ${applied}` : ''}`
        }
        if (title.length === 0 && Array.isArray(parsed?.tasks)) {
          title = parsed.tasks.map((task) => `${String(task.taskId)} · ${String(task.title ?? '')}`.slice(0, 48)).join('；')
        }
      } catch {
        // Keep the phase label when the result is not JSON.
      }
    }
  } else if (typeof args.taskId === 'string') {
    title = ''
  }
  if (props.phase === 'result') {
    try {
      const parsed = JSON.parse(detail)
      if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
        title = parsed.tasks.map((task) => String(task.title ?? task.taskId ?? '')).filter(Boolean).join('；')
      } else if (typeof parsed?.title === 'string') {
        title = parsed.title
      }
    } catch {
      // Result is not JSON; keep the card title empty.
    }
  }
  return h('div', { className: 'taskline-tool' },
    h('button', {
      type: 'button',
      className: 'taskline-tool-head taskline-tool-toggle',
      'aria-expanded': String(open),
      onClick: () => setOpen((value) => !value),
    },
      h('span', { className: 'taskline-tool-name' }, name),
      h('span', { className: 'taskline-tool-state' }, state),
      title.length > 0 ? h('span', { className: 'taskline-tool-title' }, title) : null,
      h('span', { className: 'taskline-tool-action' }, open ? '收起' : '展开'),
    ),
    open ? h('pre', { className: 'taskline-tool-body' }, detail) : null,
  )
}

function TaskNode({ task, childrenOf, depth, request, compression, summary }) {
  const [collapsed, setCollapsed] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(task.title)
  const children = childrenOf.get(task.id) ?? []
  const stateText = task.state === 'open' ? '进行中' : task.state === 'completed' ? '已完成' : '已放弃'
  const status = task.state === 'open' ? 'active' : task.state === 'completed' ? 'done' : 'idle'
  const act = async (method, payload = {}) => {
    setBusy(true)
    try {
      await request?.(method, { taskId: task.id, ...payload })
    } finally {
      setBusy(false)
      setRenaming(false)
    }
  }
  const actions = []
  if (task.state === 'open') {
    actions.push(h('button', { key: 'rename', type: 'button', className: 'taskline-toggle', disabled: busy, onClick: () => setRenaming((value) => !value) }, '改名'))
    actions.push(h('button', { key: 'complete', type: 'button', className: 'taskline-toggle', disabled: busy, onClick: () => act('complete') }, '完成'))
    actions.push(h('button', { key: 'abandon', type: 'button', className: 'taskline-toggle', disabled: busy, onClick: () => act('abandon') }, '放弃'))
  } else {
    actions.push(h('button', { key: 'reopen', type: 'button', className: 'taskline-toggle', disabled: busy, onClick: () => act('reopen') }, '重开'))
  }
  const partial = Array.isArray(task.partialRanges) ? task.partialRanges : []
  const badge = partial.length > 0 && task.state === 'open'
    ? h('button', { type: 'button', className: 'taskline-badge is-partial', 'aria-expanded': String(showSummary), onClick: () => setShowSummary((value) => !value) },
        `部分压缩 ${partial.slice(-2).map((range) => `${range.fromSeq}–${range.toSeq}`).join('、')}`)
    : compression === undefined
    ? null
    : compression.status === 'done'
      ? h('button', { type: 'button', className: 'taskline-badge is-done', 'aria-expanded': String(showSummary), onClick: () => setShowSummary((value) => !value) }, `已压缩 ${formatTokens(compression.before)} → ${formatTokens(compression.after)}`)
      : h('span', { className: 'taskline-badge is-failed', title: compression.reason }, '压缩失败')
  return h('div', { className: 'taskline-node', 'data-status': status, 'data-compression': compression?.status ?? 'none' },
    h('div', { className: 'taskline-node-row' },
      h('span', { className: `taskline-dot is-${status}` }),
      children.length > 0
        ? h('button', { type: 'button', className: 'taskline-toggle', 'aria-expanded': String(!collapsed), onClick: () => setCollapsed((value) => !value) }, collapsed ? '展开' : '收起')
        : null,
      h('span', { className: 'taskline-node-title' }, task.title),
      task.autoCreated === true ? h('span', { className: 'taskline-chip' }, '自动') : null,
      h('span', { className: 'taskline-node-meta' }, stateText),
      badge,
    ),
    h('div', { className: 'taskline-node-row' },
      h('span', { className: 'taskline-node-meta' }, `${task.id} · seq ${task.startSeq}–${task.endSeq ?? '…'}`),
      h('span', { className: 'taskline-count' }, actions),
    ),
    renaming
      ? h('div', { className: 'taskline-node-row' },
          h('input', { className: 'taskline-input', value: title, onChange: (event) => setTitle(event.target.value) }),
          h('button', { type: 'button', className: 'taskline-toggle', disabled: busy, onClick: () => act('rename', { title }) }, '保存'))
      : null,
    showSummary && typeof summary === 'string' && summary.length > 0
      ? h('div', { className: 'taskline-summary' }, summary)
      : null,
    children.length > 0 && !collapsed
      ? h('div', { className: 'taskline-children' }, children.map((child) => h(TaskNode, {
          key: child.id, task: child, childrenOf, depth: depth + 1, request,
          compression: undefined, summary: undefined,
        })))
      : null,
  )
}

function CompactionItem({ item }) {
  const [open, setOpen] = useState(false)
  const detail = item.summary || item.reason || '没有可用详情'
  return h('div', { className: 'taskline-node', 'data-compression': item.outcome === 'ok' ? 'done' : 'failed' },
    h('div', { className: 'taskline-node-row' },
      h('span', { className: `taskline-dot ${item.outcome === 'ok' ? 'is-done' : 'is-idle'}` }),
      h('button', { type: 'button', className: 'taskline-toggle', 'aria-expanded': String(open), onClick: () => setOpen((value) => !value) }, open ? '收起' : '详情'),
      h('span', { className: 'taskline-node-title' }, `${item.backend} · ${item.outcome === 'ok' ? '压缩成功' : '压缩失败'}`),
      h('span', { className: 'taskline-node-meta' }, `${item.fromSeq ?? '—'} – ${item.toSeq ?? '—'}`),
    ),
    h('div', { className: 'taskline-node-meta' }, `任务: ${item.taskIds.length > 0 ? item.taskIds.join(', ') : '—'}${item.outcome !== 'ok' || item.beforeTokens == null ? '' : ` · ${formatTokens(item.beforeTokens)} → ${formatTokens(item.afterTokens)} tokens`}`),
    open ? h('div', { className: 'taskline-summary' }, detail) : null,
  )
}

function CompactionList({ compactions }) {
  if (!Array.isArray(compactions) || compactions.length === 0) {
    return h('div', { className: 'taskline-empty' }, '还没有压缩记录')
  }
  return h('div', { className: 'taskline-tree' }, compactions.slice().reverse().map((item, index) => h(CompactionItem, { key: index, item })))
}

function Panel({ useProjection, request }) {
  const [tab, setTab] = useState('tasks')
  const view = useProjection('taskline')
  if (view === null || view === undefined || !Array.isArray(view.tasks) || view.tasks.length === 0) {
    return h('div', { className: 'taskline-panel' }, h('div', { className: 'taskline-empty' }, '当前会话还没有任务'))
  }
  const childrenOf = new Map()
  for (const task of view.tasks) {
    if (task.parentTaskId === null) continue
    const list = childrenOf.get(task.parentTaskId) ?? []
    list.push(task)
    childrenOf.set(task.parentTaskId, list)
  }
  const roots = view.tasks.filter((task) => task.parentTaskId === null)
  const open = view.tasks.filter((task) => task.state === 'open').length
  const done = view.tasks.filter((task) => task.state === 'completed').length
  const compression = new Map()
  const summaries = new Map()
  for (const item of view.compactions ?? []) {
    for (const id of item.partial ?? []) summaries.set(id, item.summary ?? '')
    const ok = item.outcome === 'ok'
    for (const id of ok ? item.kept : item.taskIds) {
      if (ok) {
        compression.set(id, { status: 'done', before: item.beforeTokens, after: item.afterTokens })
        if (item.summary) summaries.set(id, item.summary)
      } else if (Array.isArray(item.partial) && item.partial.includes(id)) {
        summaries.set(id, item.summary ?? '')
      } else {
        compression.set(id, { status: 'failed', reason: item.reason || item.outcome })
      }
    }
  }
  const ratio = view.tasks.length === 0 ? 0 : Math.round((done / view.tasks.length) * 100)
  return h('div', { className: 'taskline-panel' },
    h('div', { className: 'taskline-panel-head-row' },
      h('span', { className: 'taskline-panel-title' }, '任务'),
      h('span', { className: 'taskline-count' }, `${done}/${view.tasks.length} 已完成 · 进行中 ${open}`),
    ),
    h('div', { className: 'taskline-progress', title: `${ratio}%` },
      h('span', { className: 'is-done', style: { width: `${ratio}%` } })),
    h('div', { className: 'taskline-row' },
      h('button', { type: 'button', className: 'taskline-toggle', 'aria-pressed': String(tab === 'tasks'), onClick: () => setTab('tasks') }, '任务'),
      h('button', { type: 'button', className: 'taskline-toggle', 'aria-pressed': String(tab === 'compactions'), onClick: () => setTab('compactions') }, '压缩'),
    ),
    tab === 'compactions'
      ? h(CompactionList, { compactions: view.compactions })
      : h('div', { className: 'taskline-tree' }, roots.map((task) => h(TaskNode, {
          key: task.id, task, childrenOf, depth: 0, request,
          compression: compression.get(task.id),
          summary: summaries.get(task.id),
        }))),
  )
}

function SettingsPanel({ settings }) {
  const subscribe = (callback) => (settings === undefined ? () => {} : settings.subscribe(callback))
  const getSnapshot = () => (settings === undefined ? undefined : settings.getSnapshot())
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const value = snapshot?.value ?? {}
  const [maxDepth, setMaxDepth] = useState(value?.nesting?.maxDepth ?? 0)
  const [thresholdCalls, setThresholdCalls] = useState(value?.autoCreate?.thresholdCalls ?? 3)
  const [autoEnabled, setAutoEnabled] = useState(value?.autoCreate?.enabled ?? true)
  const [thresholdRatio, setThresholdRatio] = useState(value?.compaction?.thresholdRatio ?? 0.8)
  const [contextLimit, setContextLimit] = useState(value?.compaction?.contextLimit ?? 0)
  const [tasksLater, setTasksLater] = useState(value?.compaction?.tasksLater ?? 2)
  const compressor = value?.compaction?.compressor ?? 'bili'
  const [saveState, setSaveState] = useState('')
  const [busy, setBusy] = useState(false)
  const chooseCompressor = async (next) => {
    if (settings === undefined) { setSaveState('配置不可写'); return }
    const accepted = await settings.mutate([{ op: 'set', path: ['compaction', 'compressor'], value: next }], snapshot?.revision)
    setSaveState(accepted === false ? '切换失败' : next === 'builtin' ? '已切换到内置压缩（组件状态刷新页面后更新）' : '已切换到 bili 压缩（组件状态刷新页面后更新）')
  }
  const save = async () => {
    if (settings === undefined) { setSaveState('配置不可写'); return }
    setBusy(true)
    try {
      const accepted = await settings.mutate([
        { op: 'set', path: ['nesting', 'maxDepth'], value: Number(maxDepth) },
        { op: 'set', path: ['autoCreate', 'thresholdCalls'], value: Number(thresholdCalls) },
        { op: 'set', path: ['autoCreate', 'enabled'], value: Boolean(autoEnabled) },
        { op: 'set', path: ['compaction', 'thresholdRatio'], value: Number(thresholdRatio) },
        { op: 'set', path: ['compaction', 'contextLimit'], value: Number(contextLimit) },
        { op: 'set', path: ['compaction', 'tasksLater'], value: Number(tasksLater) },
      ], snapshot?.revision)
      setSaveState(accepted === false ? `保存失败 status=${snapshot?.status} writable=${String(snapshot?.writable)} rev=${String(snapshot?.revision)}` : '已保存')
    } catch (error) {
      setSaveState(`保存失败 ${String(error?.message ?? error)}`)
    } finally {
      setBusy(false)
    }
  }
  return h('div', { className: 'taskline-panel' },
    h('div', { className: 'taskline-panel-head' }, '任务'),
    h('label', { className: 'taskline-field' }, '嵌套层数（0 = 不嵌套）',
      h(Input, { type: 'number', min: 0, max: 5, step: 1, value: maxDepth, onChange: (event) => setMaxDepth(event.target.value) })),
    h('label', { className: 'taskline-field' }, '自动创建阈值（连续工具调用）',
      h(Input, { type: 'number', min: 1, max: 20, step: 1, value: thresholdCalls, onChange: (event) => setThresholdCalls(event.target.value) })),
    h('div', { className: 'taskline-field' },
      h(Switch, { checked: autoEnabled, onChange: setAutoEnabled, label: '启用自动创建' }),
      h('span', null, '启用自动创建')),
    h('label', { className: 'taskline-field' }, '自动压缩阈值（0.1–1）',
      h(Input, { type: 'number', min: 0.1, max: 1, step: 0.05, value: thresholdRatio, onChange: (event) => setThresholdRatio(event.target.value) })),
    h('label', { className: 'taskline-field' }, '上下文上限（tokens，0 = 跟随模型）',
      h(Input, { type: 'number', min: 0, step: 1000, value: contextLimit, onChange: (event) => setContextLimit(event.target.value) })),
    h('label', { className: 'taskline-field' }, '已完成任务延迟轮次（再等 N 轮后压缩）',
      h(Input, { type: 'number', min: 1, max: 10, step: 1, value: tasksLater, onChange: (event) => setTasksLater(event.target.value) })),
    h('div', { className: 'taskline-field' }, '压缩器',
      h(Button, { variant: compressor === 'builtin' ? 'primary' : 'outline', size: 'sm', onClick: () => chooseCompressor('builtin') }, '内置压缩'),
      h(Button, { variant: compressor === 'bili' ? 'primary' : 'outline', size: 'sm', onClick: () => chooseCompressor('bili') }, 'bili 压缩')),
    h('div', { className: 'taskline-panel-head' }, 'bili 模式下自动压缩（延迟/阈值）失效，压缩由模型调用 task_compress 触发。'),
    h(Button, { variant: 'primary', size: 'sm', disabled: busy, onClick: save }, '保存'),
    saveState.length === 0 ? null : h('div', { className: 'taskline-panel-head' }, saveState),
  )
}

export function apply(ctx) {
  installStyles()
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'taskline',
      order: 30,
      inject: (sessionId) => ({ openTree: () => ctx.sidebarRight.openTabIn(sessionId, 'taskline') }),
    }, Dock))
  for (const tool of TOOL_NAMES) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: tool }, ToolCard))
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: 'dsh-taskline-ui',
    kind: 'taskline',
    priority: 'extension',
    title: () => '任务',
  }), 'taskline: right tab')
  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: 'dsh-taskline-ui',
      inject: (sessionId) => ({
        request: (method, payload) =>
          ctx.connection.rpc.call('/taskline', method, { sessionId, ...payload }, new AbortController().signal),
      }),
    }, Panel))
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register({
      name: 'plugins.bundle.config',
      key: 'dsh-taskline',
      inject: () => ({ settings: ctx.configForms.get('taskline') }),
    }, SettingsPanel))
}
