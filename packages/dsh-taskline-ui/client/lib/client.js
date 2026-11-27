window.__ModuleLoader__.load({
	id: "dsh-taskline-ui",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/dsh-taskline-ui/src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var inject = ["slots", "sidebarRightTabs", "sidebarRight", "connection", "configForms"];
var TOOL_NAMES = ["task_start", "task_rename", "task_complete", "task_abandon", "task_reopen", "task_compress", "task_bili_status", "compress"];
function formatTokens(value) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}m`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}
var CSS = [
  ".taskline-dock{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));margin:0 auto 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);padding:8px 10px;display:flex;flex-direction:column;gap:6px}",
  ".taskline-dock *{box-sizing:border-box}",
  ".taskline-row{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:12px;min-width:0}",
  ".taskline-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}",
  ".taskline-dot.is-done{background:var(--dsw-alias-state-done-primary)}",
  ".taskline-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".taskline-count{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
  ".taskline-toggle{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;font-size:11px;padding:1px 7px;cursor:pointer}",
  ".taskline-bar{display:flex;height:6px;gap:2px}",
  ".taskline-bar span{border-radius:999px;height:100%}",
  ".taskline-bar .is-done{background:var(--dsw-alias-state-done-primary)}",
  ".taskline-bar .is-active{background:var(--dsw-alias-brand-primary)}",
  ".taskline-bar .is-idle{background:var(--dsw-alias-bg-layer-3)}",
  ".taskline-tool{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;margin:6px 0}",
  ".taskline-tool-head{display:flex;gap:8px;align-items:center;padding:6px 10px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-secondary)}",
  ".taskline-tool-toggle{width:100%;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;text-align:left}",
  ".taskline-tool-state{flex:none;color:var(--dsw-alias-label-secondary)}",
  ".taskline-tool-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}",
  ".taskline-tool-action{flex:none;color:var(--dsw-alias-brand-primary)}",
  ".taskline-tool-name{color:var(--dsw-alias-brand-primary);font-family:ui-monospace,Menlo,Consolas,monospace}",
  ".taskline-tool-body{margin:0;padding:8px 10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-primary);max-height:160px;overflow:auto;white-space:pre-wrap}",
  ".taskline-panel-head-row{display:flex;align-items:center;justify-content:space-between;gap:8px}",
  ".taskline-panel-title{font-weight:600;color:var(--dsw-alias-label-primary);font-size:12px}",
  ".taskline-progress{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}",
  ".taskline-progress span{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width 160ms ease}",
  ".taskline-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-label-tertiary)}",
  ".taskline-dot.is-active{background:var(--dsw-alias-brand-primary)}",
  ".taskline-dot.is-done{background:var(--dsw-alias-state-done-primary)}",
  ".taskline-dot.is-idle{background:var(--dsw-alias-label-tertiary)}",
  ".taskline-chip{flex:none;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;padding:0 6px;line-height:16px}",
  ".taskline-badge{display:inline-flex;align-items:center;gap:4px;flex:none;border-radius:999px;padding:1px 8px;font-size:10.5px;line-height:16px;font-variant-numeric:tabular-nums;border:1px solid transparent;cursor:pointer}",
  ".taskline-badge.is-done{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}",
  ".taskline-badge.is-partial{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent)}",
  ".taskline-badge.is-failed{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);cursor:default}",
  ".taskline-summary{margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-size:11.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}",
  ".taskline-node[data-compression=done]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 26%,var(--dsw-alias-border-l1))}",
  ".taskline-node[data-compression=failed]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 26%,var(--dsw-alias-border-l1))}",
  ".taskline-panel{padding:10px;display:flex;flex-direction:column;gap:8px}",
  ".taskline-panel-head{color:var(--dsw-alias-label-secondary);font-size:11px}",
  ".taskline-tree{display:flex;flex-direction:column;gap:4px}",
  ".taskline-node{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:6px 8px;display:flex;flex-direction:column;gap:3px}",
  ".taskline-node-row{display:flex;align-items:center;gap:6px;min-width:0}",
  ".taskline-node-title{font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}",
  ".taskline-node-meta{color:var(--dsw-alias-label-secondary);font-size:10.5px;font-family:ui-monospace,Menlo,Consolas,monospace}",
  ".taskline-children{padding-left:12px;border-left:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:4px;margin-left:4px}",
  ".taskline-empty{color:var(--dsw-alias-label-tertiary);font-size:11px;padding:8px 2px}",
  ".taskline-input{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11px;padding:2px 6px;min-width:0;flex:1}",
  ".taskline-field{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11px}",
  ".taskline-field input[type=number]{width:64px}"
].join("");
function installStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-taskline]") !== null) return;
  const style = document.createElement("style");
  style.dataset.taskline = "1";
  style.textContent = CSS;
  document.head.append(style);
}
function Dock({ useProjection, openTree }) {
  const [collapsed, setCollapsed] = (0, import_react.useState)(false);
  const view = useProjection("taskline");
  if (view === null || view === void 0 || !Array.isArray(view.tasks) || view.tasks.length === 0) return null;
  const total = view.tasks.length;
  const done = view.tasks.filter((task) => task.state !== "open").length;
  const open = view.tasks.find((task) => task.id === view.openRootId) ?? view.tasks.find((task) => task.state === "open");
  const title = open?.title ?? "\u4EFB\u52A1";
  const active = open === void 0 ? 0 : 1;
  const idle = Math.max(0, total - done - active);
  const pct = (count) => `${total === 0 ? 0 : count / total * 100}%`;
  return (0, import_react.createElement)(
    "div",
    { className: "taskline-dock" },
    (0, import_react.createElement)(
      "div",
      { className: "taskline-row" },
      (0, import_react.createElement)("span", { className: `taskline-dot${open === void 0 ? " is-done" : ""}` }),
      (0, import_react.createElement)("span", { className: "taskline-title" }, title),
      (0, import_react.createElement)("span", { className: "taskline-count" }, `${done}/${total}`),
      (0, import_react.createElement)("button", { type: "button", className: "taskline-toggle", onClick: () => openTree?.() }, "\u4EFB\u52A1\u6811"),
      (0, import_react.createElement)("button", {
        type: "button",
        className: "taskline-toggle",
        "aria-expanded": String(!collapsed),
        onClick: () => setCollapsed((value) => !value)
      }, collapsed ? "\u5C55\u5F00" : "\u6536\u8D77")
    ),
    collapsed ? null : (0, import_react.createElement)(
      "div",
      { className: "taskline-bar" },
      (0, import_react.createElement)("span", { className: "is-done", style: { width: pct(done) } }),
      (0, import_react.createElement)("span", { className: "is-active", style: { width: pct(active) } }),
      (0, import_react.createElement)("span", { className: "is-idle", style: { width: pct(idle) } })
    )
  );
}
function payloadText(props) {
  if (props.phase === "result") {
    const content = props.block?.content;
    if (Array.isArray(content)) {
      const text = content.map((part) => part?.type === "text" ? part.text : "").join("\n");
      if (text.length > 0) return text.slice(0, 2e3);
    }
    return JSON.stringify(props.block ?? {}, null, 2).slice(0, 2e3);
  }
  return JSON.stringify(props.block?.args ?? {}, null, 2).slice(0, 2e3);
}
function ToolCard(props) {
  const name = props.block?.name ?? props.toolName ?? "task";
  const args = props.block?.args ?? {};
  const detail = payloadText(props);
  const [open, setOpen] = (0, import_react.useState)(false);
  let state = props.phase === "result" ? "\u5B8C\u6210" : "\u6267\u884C\u4E2D";
  let title = "";
  if (name === "task_start" && typeof args.title === "string") {
    title = `\u4EFB\u52A1\uFF1A${args.title}`;
  } else if (name === "task_compress" || name === "compress") {
    const tasks = Array.isArray(args.tasks) ? args.tasks : [];
    const described = tasks.length > 0 ? tasks.map((task) => {
      const summary = String(task?.summary ?? "").split("\n")[0].trim();
      const head = summary.length > 0 ? summary.slice(0, 36) : "\u6458\u8981";
      return `${String(task?.taskId ?? "?")} \xB7 ${head}`;
    }).join("\uFF1B") : "";
    title = described;
    if (props.phase === "result") {
      try {
        const parsed = JSON.parse(detail);
        if (typeof parsed?.outcome === "string") {
          const applied = Number(parsed?.applied ?? 0);
          state = `${parsed.outcome}${applied > 0 ? ` \xB7 \u5DF2\u538B\u7F29 ${applied}` : ""}`;
        }
        if (title.length === 0 && Array.isArray(parsed?.tasks)) {
          title = parsed.tasks.map((task) => `${String(task.taskId)} \xB7 ${String(task.title ?? "")}`.slice(0, 48)).join("\uFF1B");
        }
      } catch {
      }
    }
  } else if (typeof args.taskId === "string") {
    title = "";
  }
  if (props.phase === "result") {
    try {
      const parsed = JSON.parse(detail);
      if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
        title = parsed.tasks.map((task) => String(task.title ?? task.taskId ?? "")).filter(Boolean).join("\uFF1B");
      } else if (typeof parsed?.title === "string") {
        title = parsed.title;
      }
    } catch {
    }
  }
  return (0, import_react.createElement)(
    "div",
    { className: "taskline-tool" },
    (0, import_react.createElement)(
      "button",
      {
        type: "button",
        className: "taskline-tool-head taskline-tool-toggle",
        "aria-expanded": String(open),
        onClick: () => setOpen((value) => !value)
      },
      (0, import_react.createElement)("span", { className: "taskline-tool-name" }, name),
      (0, import_react.createElement)("span", { className: "taskline-tool-state" }, state),
      title.length > 0 ? (0, import_react.createElement)("span", { className: "taskline-tool-title" }, title) : null,
      (0, import_react.createElement)("span", { className: "taskline-tool-action" }, open ? "\u6536\u8D77" : "\u5C55\u5F00")
    ),
    open ? (0, import_react.createElement)("pre", { className: "taskline-tool-body" }, detail) : null
  );
}
function TaskNode({ task, childrenOf, depth, request, compression, summary }) {
  const [collapsed, setCollapsed] = (0, import_react.useState)(false);
  const [showSummary, setShowSummary] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [renaming, setRenaming] = (0, import_react.useState)(false);
  const [title, setTitle] = (0, import_react.useState)(task.title);
  const children = childrenOf.get(task.id) ?? [];
  const stateText = task.state === "open" ? "\u8FDB\u884C\u4E2D" : task.state === "completed" ? "\u5DF2\u5B8C\u6210" : "\u5DF2\u653E\u5F03";
  const status = task.state === "open" ? "active" : task.state === "completed" ? "done" : "idle";
  const act = async (method, payload = {}) => {
    setBusy(true);
    try {
      await request?.(method, { taskId: task.id, ...payload });
    } finally {
      setBusy(false);
      setRenaming(false);
    }
  };
  const actions = [];
  if (task.state === "open") {
    actions.push((0, import_react.createElement)("button", { key: "rename", type: "button", className: "taskline-toggle", disabled: busy, onClick: () => setRenaming((value) => !value) }, "\u6539\u540D"));
    actions.push((0, import_react.createElement)("button", { key: "complete", type: "button", className: "taskline-toggle", disabled: busy, onClick: () => act("complete") }, "\u5B8C\u6210"));
    actions.push((0, import_react.createElement)("button", { key: "abandon", type: "button", className: "taskline-toggle", disabled: busy, onClick: () => act("abandon") }, "\u653E\u5F03"));
  } else {
    actions.push((0, import_react.createElement)("button", { key: "reopen", type: "button", className: "taskline-toggle", disabled: busy, onClick: () => act("reopen") }, "\u91CD\u5F00"));
  }
  const partial = Array.isArray(task.partialRanges) ? task.partialRanges : [];
  const badge = partial.length > 0 && task.state === "open" ? (0, import_react.createElement)(
    "button",
    { type: "button", className: "taskline-badge is-partial", "aria-expanded": String(showSummary), onClick: () => setShowSummary((value) => !value) },
    `\u90E8\u5206\u538B\u7F29 ${partial.slice(-2).map((range) => `${range.fromSeq}\u2013${range.toSeq}`).join("\u3001")}`
  ) : compression === void 0 ? null : compression.status === "done" ? (0, import_react.createElement)("button", { type: "button", className: "taskline-badge is-done", "aria-expanded": String(showSummary), onClick: () => setShowSummary((value) => !value) }, `\u5DF2\u538B\u7F29 ${formatTokens(compression.before)} \u2192 ${formatTokens(compression.after)}`) : (0, import_react.createElement)("span", { className: "taskline-badge is-failed", title: compression.reason }, "\u538B\u7F29\u5931\u8D25");
  return (0, import_react.createElement)(
    "div",
    { className: "taskline-node", "data-status": status, "data-compression": compression?.status ?? "none" },
    (0, import_react.createElement)(
      "div",
      { className: "taskline-node-row" },
      (0, import_react.createElement)("span", { className: `taskline-dot is-${status}` }),
      children.length > 0 ? (0, import_react.createElement)("button", { type: "button", className: "taskline-toggle", "aria-expanded": String(!collapsed), onClick: () => setCollapsed((value) => !value) }, collapsed ? "\u5C55\u5F00" : "\u6536\u8D77") : null,
      (0, import_react.createElement)("span", { className: "taskline-node-title" }, task.title),
      task.autoCreated === true ? (0, import_react.createElement)("span", { className: "taskline-chip" }, "\u81EA\u52A8") : null,
      (0, import_react.createElement)("span", { className: "taskline-node-meta" }, stateText),
      badge
    ),
    (0, import_react.createElement)(
      "div",
      { className: "taskline-node-row" },
      (0, import_react.createElement)("span", { className: "taskline-node-meta" }, `${task.id} \xB7 seq ${task.startSeq}\u2013${task.endSeq ?? "\u2026"}`),
      (0, import_react.createElement)("span", { className: "taskline-count" }, actions)
    ),
    renaming ? (0, import_react.createElement)(
      "div",
      { className: "taskline-node-row" },
      (0, import_react.createElement)("input", { className: "taskline-input", value: title, onChange: (event) => setTitle(event.target.value) }),
      (0, import_react.createElement)("button", { type: "button", className: "taskline-toggle", disabled: busy, onClick: () => act("rename", { title }) }, "\u4FDD\u5B58")
    ) : null,
    showSummary && typeof summary === "string" && summary.length > 0 ? (0, import_react.createElement)("div", { className: "taskline-summary" }, summary) : null,
    children.length > 0 && !collapsed ? (0, import_react.createElement)("div", { className: "taskline-children" }, children.map((child) => (0, import_react.createElement)(TaskNode, {
      key: child.id,
      task: child,
      childrenOf,
      depth: depth + 1,
      request,
      compression: void 0,
      summary: void 0
    }))) : null
  );
}
function CompactionItem({ item }) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const detail = item.summary || item.reason || "\u6CA1\u6709\u53EF\u7528\u8BE6\u60C5";
  return (0, import_react.createElement)(
    "div",
    { className: "taskline-node", "data-compression": item.outcome === "ok" ? "done" : "failed" },
    (0, import_react.createElement)(
      "div",
      { className: "taskline-node-row" },
      (0, import_react.createElement)("span", { className: `taskline-dot ${item.outcome === "ok" ? "is-done" : "is-idle"}` }),
      (0, import_react.createElement)("button", { type: "button", className: "taskline-toggle", "aria-expanded": String(open), onClick: () => setOpen((value) => !value) }, open ? "\u6536\u8D77" : "\u8BE6\u60C5"),
      (0, import_react.createElement)("span", { className: "taskline-node-title" }, `${item.backend} \xB7 ${item.outcome === "ok" ? "\u538B\u7F29\u6210\u529F" : "\u538B\u7F29\u5931\u8D25"}`),
      (0, import_react.createElement)("span", { className: "taskline-node-meta" }, `${item.fromSeq ?? "\u2014"} \u2013 ${item.toSeq ?? "\u2014"}`)
    ),
    (0, import_react.createElement)("div", { className: "taskline-node-meta" }, `\u4EFB\u52A1: ${item.taskIds.length > 0 ? item.taskIds.join(", ") : "\u2014"}${item.outcome !== "ok" || item.beforeTokens == null ? "" : ` \xB7 ${formatTokens(item.beforeTokens)} \u2192 ${formatTokens(item.afterTokens)} tokens`}`),
    open ? (0, import_react.createElement)("div", { className: "taskline-summary" }, detail) : null
  );
}
function CompactionList({ compactions }) {
  if (!Array.isArray(compactions) || compactions.length === 0) {
    return (0, import_react.createElement)("div", { className: "taskline-empty" }, "\u8FD8\u6CA1\u6709\u538B\u7F29\u8BB0\u5F55");
  }
  return (0, import_react.createElement)("div", { className: "taskline-tree" }, compactions.slice().reverse().map((item, index) => (0, import_react.createElement)(CompactionItem, { key: index, item })));
}
function Panel({ useProjection, request }) {
  const [tab, setTab] = (0, import_react.useState)("tasks");
  const view = useProjection("taskline");
  if (view === null || view === void 0 || !Array.isArray(view.tasks) || view.tasks.length === 0) {
    return (0, import_react.createElement)("div", { className: "taskline-panel" }, (0, import_react.createElement)("div", { className: "taskline-empty" }, "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4EFB\u52A1"));
  }
  const childrenOf = /* @__PURE__ */ new Map();
  for (const task of view.tasks) {
    if (task.parentTaskId === null) continue;
    const list = childrenOf.get(task.parentTaskId) ?? [];
    list.push(task);
    childrenOf.set(task.parentTaskId, list);
  }
  const roots = view.tasks.filter((task) => task.parentTaskId === null);
  const open = view.tasks.filter((task) => task.state === "open").length;
  const done = view.tasks.filter((task) => task.state === "completed").length;
  const compression = /* @__PURE__ */ new Map();
  const summaries = /* @__PURE__ */ new Map();
  for (const item of view.compactions ?? []) {
    for (const id of item.partial ?? []) summaries.set(id, item.summary ?? "");
    const ok = item.outcome === "ok";
    for (const id of ok ? item.kept : item.taskIds) {
      if (ok) {
        compression.set(id, { status: "done", before: item.beforeTokens, after: item.afterTokens });
        if (item.summary) summaries.set(id, item.summary);
      } else if (Array.isArray(item.partial) && item.partial.includes(id)) {
        summaries.set(id, item.summary ?? "");
      } else {
        compression.set(id, { status: "failed", reason: item.reason || item.outcome });
      }
    }
  }
  const ratio = view.tasks.length === 0 ? 0 : Math.round(done / view.tasks.length * 100);
  return (0, import_react.createElement)(
    "div",
    { className: "taskline-panel" },
    (0, import_react.createElement)(
      "div",
      { className: "taskline-panel-head-row" },
      (0, import_react.createElement)("span", { className: "taskline-panel-title" }, "\u4EFB\u52A1"),
      (0, import_react.createElement)("span", { className: "taskline-count" }, `${done}/${view.tasks.length} \u5DF2\u5B8C\u6210 \xB7 \u8FDB\u884C\u4E2D ${open}`)
    ),
    (0, import_react.createElement)(
      "div",
      { className: "taskline-progress", title: `${ratio}%` },
      (0, import_react.createElement)("span", { className: "is-done", style: { width: `${ratio}%` } })
    ),
    (0, import_react.createElement)(
      "div",
      { className: "taskline-row" },
      (0, import_react.createElement)("button", { type: "button", className: "taskline-toggle", "aria-pressed": String(tab === "tasks"), onClick: () => setTab("tasks") }, "\u4EFB\u52A1"),
      (0, import_react.createElement)("button", { type: "button", className: "taskline-toggle", "aria-pressed": String(tab === "compactions"), onClick: () => setTab("compactions") }, "\u538B\u7F29")
    ),
    tab === "compactions" ? (0, import_react.createElement)(CompactionList, { compactions: view.compactions }) : (0, import_react.createElement)("div", { className: "taskline-tree" }, roots.map((task) => (0, import_react.createElement)(TaskNode, {
      key: task.id,
      task,
      childrenOf,
      depth: 0,
      request,
      compression: compression.get(task.id),
      summary: summaries.get(task.id)
    })))
  );
}
function SettingsPanel({ settings }) {
  const subscribe = (callback) => settings === void 0 ? () => {
  } : settings.subscribe(callback);
  const getSnapshot = () => settings === void 0 ? void 0 : settings.getSnapshot();
  const snapshot = (0, import_react.useSyncExternalStore)(subscribe, getSnapshot);
  const value = snapshot?.value ?? {};
  const [maxDepth, setMaxDepth] = (0, import_react.useState)(value?.nesting?.maxDepth ?? 0);
  const [thresholdCalls, setThresholdCalls] = (0, import_react.useState)(value?.autoCreate?.thresholdCalls ?? 3);
  const [autoEnabled, setAutoEnabled] = (0, import_react.useState)(value?.autoCreate?.enabled ?? true);
  const [thresholdRatio, setThresholdRatio] = (0, import_react.useState)(value?.compaction?.thresholdRatio ?? 0.8);
  const [contextLimit, setContextLimit] = (0, import_react.useState)(value?.compaction?.contextLimit ?? 0);
  const [tasksLater, setTasksLater] = (0, import_react.useState)(value?.compaction?.tasksLater ?? 2);
  const compressor = value?.compaction?.compressor ?? "bili";
  const [saveState, setSaveState] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const chooseCompressor = async (next) => {
    if (settings === void 0) {
      setSaveState("\u914D\u7F6E\u4E0D\u53EF\u5199");
      return;
    }
    const accepted = await settings.mutate([{ op: "set", path: ["compaction", "compressor"], value: next }], snapshot?.revision);
    setSaveState(accepted === false ? "\u5207\u6362\u5931\u8D25" : next === "builtin" ? "\u5DF2\u5207\u6362\u5230\u5185\u7F6E\u538B\u7F29\uFF08\u7EC4\u4EF6\u72B6\u6001\u5237\u65B0\u9875\u9762\u540E\u66F4\u65B0\uFF09" : "\u5DF2\u5207\u6362\u5230 bili \u538B\u7F29\uFF08\u7EC4\u4EF6\u72B6\u6001\u5237\u65B0\u9875\u9762\u540E\u66F4\u65B0\uFF09");
  };
  const save = async () => {
    if (settings === void 0) {
      setSaveState("\u914D\u7F6E\u4E0D\u53EF\u5199");
      return;
    }
    setBusy(true);
    try {
      const accepted = await settings.mutate([
        { op: "set", path: ["nesting", "maxDepth"], value: Number(maxDepth) },
        { op: "set", path: ["autoCreate", "thresholdCalls"], value: Number(thresholdCalls) },
        { op: "set", path: ["autoCreate", "enabled"], value: Boolean(autoEnabled) },
        { op: "set", path: ["compaction", "thresholdRatio"], value: Number(thresholdRatio) },
        { op: "set", path: ["compaction", "contextLimit"], value: Number(contextLimit) },
        { op: "set", path: ["compaction", "tasksLater"], value: Number(tasksLater) }
      ], snapshot?.revision);
      setSaveState(accepted === false ? `\u4FDD\u5B58\u5931\u8D25 status=${snapshot?.status} writable=${String(snapshot?.writable)} rev=${String(snapshot?.revision)}` : "\u5DF2\u4FDD\u5B58");
    } catch (error) {
      setSaveState(`\u4FDD\u5B58\u5931\u8D25 ${String(error?.message ?? error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (0, import_react.createElement)(
    "div",
    { className: "taskline-panel" },
    (0, import_react.createElement)("div", { className: "taskline-panel-head" }, "\u4EFB\u52A1"),
    (0, import_react.createElement)(
      "label",
      { className: "taskline-field" },
      "\u5D4C\u5957\u5C42\u6570\uFF080 = \u4E0D\u5D4C\u5957\uFF09",
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, { type: "number", min: 0, max: 5, step: 1, value: maxDepth, onChange: (event) => setMaxDepth(event.target.value) })
    ),
    (0, import_react.createElement)(
      "label",
      { className: "taskline-field" },
      "\u81EA\u52A8\u521B\u5EFA\u9608\u503C\uFF08\u8FDE\u7EED\u5DE5\u5177\u8C03\u7528\uFF09",
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, { type: "number", min: 1, max: 20, step: 1, value: thresholdCalls, onChange: (event) => setThresholdCalls(event.target.value) })
    ),
    (0, import_react.createElement)(
      "div",
      { className: "taskline-field" },
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Switch, { checked: autoEnabled, onChange: setAutoEnabled, label: "\u542F\u7528\u81EA\u52A8\u521B\u5EFA" }),
      (0, import_react.createElement)("span", null, "\u542F\u7528\u81EA\u52A8\u521B\u5EFA")
    ),
    (0, import_react.createElement)(
      "label",
      { className: "taskline-field" },
      "\u81EA\u52A8\u538B\u7F29\u9608\u503C\uFF080.1\u20131\uFF09",
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, { type: "number", min: 0.1, max: 1, step: 0.05, value: thresholdRatio, onChange: (event) => setThresholdRatio(event.target.value) })
    ),
    (0, import_react.createElement)(
      "label",
      { className: "taskline-field" },
      "\u4E0A\u4E0B\u6587\u4E0A\u9650\uFF08tokens\uFF0C0 = \u8DDF\u968F\u6A21\u578B\uFF09",
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, { type: "number", min: 0, step: 1e3, value: contextLimit, onChange: (event) => setContextLimit(event.target.value) })
    ),
    (0, import_react.createElement)(
      "label",
      { className: "taskline-field" },
      "\u5DF2\u5B8C\u6210\u4EFB\u52A1\u5EF6\u8FDF\u8F6E\u6B21\uFF08\u518D\u7B49 N \u8F6E\u540E\u538B\u7F29\uFF09",
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, { type: "number", min: 1, max: 10, step: 1, value: tasksLater, onChange: (event) => setTasksLater(event.target.value) })
    ),
    (0, import_react.createElement)(
      "div",
      { className: "taskline-field" },
      "\u538B\u7F29\u5668",
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, { variant: compressor === "builtin" ? "primary" : "outline", size: "sm", onClick: () => chooseCompressor("builtin") }, "\u5185\u7F6E\u538B\u7F29"),
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, { variant: compressor === "bili" ? "primary" : "outline", size: "sm", onClick: () => chooseCompressor("bili") }, "bili \u538B\u7F29")
    ),
    (0, import_react.createElement)("div", { className: "taskline-panel-head" }, "bili \u6A21\u5F0F\u4E0B\u81EA\u52A8\u538B\u7F29\uFF08\u5EF6\u8FDF/\u9608\u503C\uFF09\u5931\u6548\uFF0C\u538B\u7F29\u7531\u6A21\u578B\u8C03\u7528 task_compress \u89E6\u53D1\u3002"),
    (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "sm", disabled: busy, onClick: save }, "\u4FDD\u5B58"),
    saveState.length === 0 ? null : (0, import_react.createElement)("div", { className: "taskline-panel-head" }, saveState)
  );
}
function apply(ctx) {
  installStyles();
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "taskline",
    order: 30,
    inject: (sessionId) => ({ openTree: () => ctx.sidebarRight.openTabIn(sessionId, "taskline") })
  }, Dock));
  for (const tool of TOOL_NAMES) {
    ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key: tool }, ToolCard));
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: "dsh-taskline-ui",
    kind: "taskline",
    priority: "extension",
    title: () => "\u4EFB\u52A1"
  }), "taskline: right tab");
  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: "dsh-taskline-ui",
    inject: (sessionId) => ({
      request: (method, payload) => ctx.connection.rpc.call("/taskline", method, { sessionId, ...payload }, new AbortController().signal)
    })
  }, Panel));
  ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
    name: "plugins.bundle.config",
    key: "dsh-taskline",
    inject: () => ({ settings: ctx.configForms.get("taskline") })
  }, SettingsPanel));
}

		return module.exports;
	}
});
