# 研究报告 03：issue #1 §5（UI）在 DSH 0.2.3-alpha.2 下的可行性核实

> **研究对象**：`hyperion2144/dsh-taskline` issue #1 的 §5「taskline-ui：界面规格」
> **一手来源**：DSH 源码 `/Users/mutou/vault/projects/deepseek-harness`，**commit `4b399c39a6`**（2026-11-22），**version `0.2.3-alpha.2`**
> **对照基线**：`dsh-v0.2.2-rc.5`（tag）
> **运行版本**：桌面版 `0.2.3-alpha.2.plus.1`
> **核查方式**：源码逐条比对 + slot 全量清单抽取 + 版本间 diff；未修改任何 DSH 代码，未做任何 git 写操作。
>
> **⚠️ 本文档取代旧版**（旧版基于 DSH 0.2.2，2026-11-26 11:22 写入）。
> **旧版的重大断言「官方 Timeline 不存在」是错的**，现予更正：
> 0.2.3-alpha.2 **确有官方 Timeline 包** —— `packages/experimental/timeline`
> （npm 名 `@deepseek-ai/dsh-timeline`，Loader entry `timeline-experimental`）。
> 它**已经占用** issue §5.1 点名的 `conversation.input.dock` 挂载点，
> 是 taskline-ui 最完整、最权威的参考实现，本文档 §2.2 逐文件读透。
> 旧版其余结论（token 名、挂载点语义、数据通道、设置入口位置）也在本版本重新核实，
> 凡与旧版冲突处以本文为准。

---

## ① 结论摘要表

| §5 小节 / 任务项 | 0.2.3 是否支持 | 结论 | 关键差异（vs 旧版 / vs issue） |
|---|---|---|---|
| ① 客户端插件机制 | ✅ 完全支持 | `dsh.client` 声明 + `exports["./client"]` → lazy-CJS factory → `window.__ModuleLoader__.load({id, factory})` → `window.__DSH_BOOT__` entry graph | 机制**未变**；变的是**宿主包清单与导出路径形态**（`lib/` 而非 `src/`），issue 的 `package.json` 模板需改 |
| ② 官方 Timeline | ✅ **存在**（更正旧版） | `packages/experimental/timeline`，双面包：宿主半 `src/*.ts` + 客户端半 `src/client/*.tsx` | 旧版说"不存在"是错的；它**占了 `conversation.input.dock`**（`id: 'timeline'`, `order: 20`） |
| ③ `conversation.input.dock` | ✅ 存在 | `kind: 'list'`，`scope: 'session'`；owner = `InputZone` | 与旧版一致。**但已有 4 个占用者**（todo/queue/timeline/claude-code-mods），taskline 需自带 `id` 与 `order` |
| ③ `ctx.sidebarRightTabs` + `sidebar.right.pane.tab` | ✅ 存在 | 两段式：先 `ctx.sidebarRightTabs.register({id, kind, priority, title, guide})` 注册**类型**，再 `ctx.slots.register({name:'sidebar.right.pane.tab', key: id})` 注册**内容** | 与旧版一致。issue 的"两个 tab"= **两个 kind**（各自一个 `kind` + 一个 body），不是同一个 kind 内的两个 tab |
| ③ `tool.call.toolview` | ✅ 存在 | `kind: 'keyed'`，`scope: 'session'`，key = **wire 工具名** | 与旧版一致。已占用 key 见 §2.3 清单；`task_start`/`task_complete`/`compress` 均未占用 |
| ③ `conversation.chat.node` | ✅ 存在 | `kind: 'keyed'`，`scope: 'session'`，key ∈ `ChatNodeKind`（15 个已注册 kind） | 与旧版一致。**新增** `inherited-history`（0.2.3） |
| ③ `settings.plugins.tab` | ❌ **已删除** | 0.2.2 存在（`ui-settings-plugins` 包），**0.2.3 连包一起删了** | **issue §5.5 引用的是 0.2.2 的旧 slot，0.2.3 不存在** |
| ③ `settings.section` | ✅ 存在 | `kind: 'list'`，`scope: 'root'`；0.2.3 起改由 **`settings.section.view` Factory** 承载 | 0.2.3 起 Plugins 页也会为「注册方模块所在 bundle」显示一个入口 |
| ③ `plugins.bundle.config` | ✅ 存在 | `kind: 'keyed'`，`scope: 'root'`，key = **bundle 的 npm 包名**，只在 `view: 'page'` 渲染 | **这才是 Timeline 用的设置入口**（渲染在 Plugins 页的 bundle 详情页上） |
| ③ `conversation.session.header.*` | ✅ 6 个 | `header`(single) / `.lineage`(single) / `.actions`(list) / `.utilities`(list) / `.corner`(single) / `.views.actions`(list, **root**) | 与旧版一致。0.2.3 的 `.utilities` 占用者换成了 `client-ui-session-panel` |
| ④ 设计 token | ✅ **全部真实**（1 处名字错） | `--dsw-alias-*` **是真实 token 族**（`packages/client/ui-theme/src/styles/design-platform.css`，143 个 alias token） | **旧版"一半不存在"的结论是错的**。唯一错的是 `--dsw-alias-static-amber-400` → 应为 `--dsw-static-amber-400`（static 族不在 alias 命名空间下） |
| ⑤ 客户端数据通道 | ✅ 三条通道 | Session Projection（`ctx.sessionProjections.register` + `useProjection(key)`）／ Remote RPC（`connection.rpc.call` ↔ `connection.rpc.handle`）／ 事件订阅 | 与旧版一致。**Timeline 用 Session Projection（读）+ Remote RPC（写）** |
| ⑥ 壳结构 | ⚠️ 部分一致 | 左栏 `sidebar` + 顶栏 `conversation.header` / `conversation.session.header` + 正文 `conversation.session` + 输入区 `conversation.composer` | 齿轮**不在顶栏**：设置入口在**左栏底部**（`settings.trigger`，`ui-settings-general/src/client/chrome.tsx` 用 `IconSettingsOutlineMedium`） |
| ⑦ 0.2.2 → 0.2.3 UI 变化 | — | 见 §2.7 清单（8 条影响规格） | 最大一条：`settings.plugins.tab` 被删，Plugins 从"设置里的分区"变成**独立主面板** |

**总评**：§5 的**功能意图在 0.2.3-alpha.2 下全部可实现**，而且有官方 Timeline 作完整参考实现。
但 issue 文本有 **4 处必须改写**才能落地：
① §5.5 引用的 `settings.plugins.tab` 已不存在（改用 `plugins.bundle.config` 或 `settings.section`）；
② §5.5 说"点击**顶栏**齿轮"（齿轮在左栏底部）；
③ §5.2 说"两个等宽 tab"（真实机制是两个 sidebar-right **kind**）；
④ §5.1 的 `--dsw-alias-static-amber-400` token 名不存在。

---

## ② 逐条核实

### 2.1 客户端插件机制：0.2.3 有没有变？

**结论：机制本身没变，但"包长什么样"的规范变了。**

#### (a) `dsh.client` 声明（宿主扫描的入口）

类型定义 `DshClientManifest`（`packages/util/package-manifest/src/types.ts:86-100`）：

```ts
export interface DshClientManifest {
  platform: string          // Web 消费者取 'web'
  inject?: string[]         // 仅信息性的包名依赖边，不是 Cordis service 注入
  immediately?: boolean     // 启动第一阶段预取屏障
  external?: string[]       // 超出隐式基线的精确模块表请求
}
```

解析器 `parseDshClient`（`packages/client/modules/src/client/manifest.ts:182-202`）只校验这 4 个字段；
宿主半 `ctx.clientModules` 扫描 Loader entry，把声明 `dsh.client` 的包组合成 `window.__DSH_BOOT__` 的 entry graph
（`packages/client/modules/README.md:11-13`，`docs/subsystems/client-modules.md:5`）。

#### (b) `exports["./client"]` —— 但路径形态变了

**0.2.3 的官方形态**（`packages/experimental/timeline/package.json:16-31`）：

```jsonc
"main": "./lib/index.js",
"types": "./lib/types/index.d.ts",
"exports": {
  ".":       { "types": "./lib/types/index.d.ts",       "default": "./lib/index.js" },
  "./client":{ "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
  "./cordis.patch.yml": "./cordis.patch.yml",
  "./locale/*.json": "./locale/*.json",
  "./src/*": "./src/*",
  "./package.json": "./package.json"
}
```

**⚠️ 与 issue §2 的差异**：issue 的模板写的是 `"main": "./src/index.js"` + `"exports": {".": "./src/index.js"}`。
0.2.3 的官方包指向 **`lib/`（构建产物）**，不是 `src/`。宿主加载的是 **构建后的 `lib/index.js`**；
`./src/*` 只是额外导出源码（供 source-map / 检视用），**不是**入口。

`dsh.client` 块（`packages/experimental/timeline/package.json:44-62`）：

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "platform": "web",
    "inject": [
      "@deepseek-ai/dsh-client-connection",
      "@deepseek-ai/dsh-client-locale",
      "@deepseek-ai/dsh-client-ui-conversation",
      "@deepseek-ai/dsh-client-ui-plugin-manager",
      "@deepseek-ai/dsh-client-ui-renderer",
      "@deepseek-ai/dsh-client-ui-session",
      "@deepseek-ai/dsh-client-ui-settings",
      "@deepseek-ai/dsh-client-ui-sidebar-right",
      "@deepseek-ai/dsh-client-ui-tool",
      "@deepseek-ai/dsh-api-session-controller"
    ]
  }
}
```

注意 `dsh.client.inject` 里写的是**包名**（信息性依赖边），
而客户端半里 `export const inject = [...]` 写的是 **Cordis 服务名**（真正决定激活顺序）——两者不是一回事。

#### (c) lazy-CJS 模型（未变）

`packages/client/modules/src/client/manifest.ts:8-23`：

> Executing a plugin bundle only REGISTERS its factory and deferred metadata producer.
> JavaScript module body side effects run at materialization, not registration;
> materialization (factory(require) → exports) happens on first import/require
> and is memoized in `ClientModuleLoader.loadCache`.

构建 preset `packages/client/tsdown.client.ts:1-18` 明确产物形式：

> The bundle calls `window.__ModuleLoader__.load({id, factory})` and resolves externals
> through the injected require (loader module table — cordis DI entities, no globals, no import map).

Timeline 的构建配置只有 4 行（`packages/experimental/timeline/tsdown.config.ts:1-4`）：

```ts
import { clientBundle } from '../../client/tsdown.client.ts'
export default clientBundle(import.meta.dirname, ['lib/types/index.js'], { hostPhase: true })
```

#### (d) `__DSH_BOOT__`（未变）

- 宿主把组合好的 `WebBootGraph` 写成 `globalThis["__DSH_BOOT__"]`，`<` 被转义，插件可控字符串无法逃出 script 元素
  （`docs/subsystems/client-modules.md:11`，`packages/host/webserver/tests/webserver.spec.ts:1113`）。
- 浏览器解析器 `parseBootManifest`（`packages/client/modules/src/client/manifest.ts:238-335`）严格校验：
  缺 `__DSH_BOOT__` 直接抛 `client-modules: window.__DSH_BOOT__ is missing or not an object`。
- **只有 `dsh web` 宿主会注入它**。裸 Vite 跑 `apps/web` 会白屏
  （`apps/web/vite.config.ts:12-14` 明确拒绝 standalone serve）。

#### (e) HMR（未变，但有前提）

`packages/client/hmr/README.md:30-36`：

> Run `pnpm run dev:web`, which starts the host and the rebuild watchers together
> (`--no-serve` attaches only the watchers to a host started elsewhere…).
> Each successful reload re-executes the plugin bundle and remounts the plugin with fresh state.

根 `package.json:227`：`"dev:web": "tsx scripts/dev-web.ts --poll"`。
**没有 `dev:web` watcher，client-plugin 改动不会热更新，必须刷新页面。**

> **结论**：0.2.3 的客户端插件机制与旧版描述一致，**没有机制变化**。
> 唯一要改的是 issue §2 的 `package.json` 模板：`main`/`exports` 指向 `lib/`，并去掉 `dsh.kind` / `dsh.capabilities` / `dsh.labels`
> （这三个字段**不在** `DshManifest` 里 —— `packages/util/package-manifest/src/types.ts:31-41` 只有
> `manifestVersion` / `bundle` / `profile` / `client`）。

---

### 2.2 官方 Timeline（`packages/experimental/timeline`）—— 读透

**这就是 issue §5 说的"官方 Timeline"，而且它占着 issue §5.1 点名的挂载点。**

#### (a) 包身份

| 项 | 值 | 来源 |
|---|---|---|
| npm 名 | `@deepseek-ai/dsh-timeline` | `package.json:2` |
| 版本 | `0.2.3-alpha.2` | `package.json:4` |
| 入口 | `lib/index.js`（宿主半） / `lib/client.js`（客户端半） | `package.json:16,25` |
| Loader entry id | `timeline-experimental` | `cordis.patch.yml:2` |
| `cordis.patch.yml` | `- insert: [{id: timeline-experimental, name: '@deepseek-ai/dsh-timeline'}]` | `cordis.patch.yml:1-3` |
| 客户端半目录 | `src/client/*.tsx` + `src/client/timeline.css` | `find packages/experimental/timeline/src/client` |
| 配置 id | `TIMELINE_CONFIG_ID = 'timeline-experimental'` | `src/policy.ts:2` |

> **注意**：`cordis.patch.yml` 的 `id` 是 **`timeline-experimental`**，
> 而 `plugins.bundle.config` 的 key 必须是**包名** `@deepseek-ai/dsh-timeline`——
> Timeline 客户端里 `const id = '@deepseek-ai/dsh-timeline'`（`src/client/index.ts:54`）用于 slot key，
> 而 `ctx.configForms.get<Config>(TIMELINE_CONFIG_ID)`（`src/client/index.ts:99`）用的是 **entry id**。两者不是同一个字符串。

#### (b) 宿主半（`src/*.ts`）

`src/index.ts`：

- `export const inject = ['agents','sessions','sessionProjections','tools','llm','systemPrompt']`（`:18-25`）
- `export async function apply(ctx, input)`（`:32-55`）：
  1. `:33-36` 冲突检查：若检测到独立版 `@magolor/dsh-timeline` 已启用，抛 `TIMELINE_PLUGIN_CONFLICT`
  2. `:46` `const projection = await registerProjection(ctx)`
  3. `:47` `new TimelineStorage(ctx, projection, config, ...)`
  4. `:48-54` 依次 `installTools` / `installReports` / `installGuidance` / `installReminders` / `installDelegation` / `installCommand`

**投影注册**（`src/projection.ts`）：

```ts
// src/projection.ts:65-67
export async function registerProjection(ctx: Context): Promise<TimelineReader> {
  return ctx.sessionProjections.register(createProjection())
}

// src/projection.ts:86-93
return {
  key: 'timeline',
  stateVersion: 9,
  stateSchema,
  wire: { viewSchema, view: state => state.view, summary: false },
  init: (header, inherited) => ({...}),
  apply: (state, event) => {...},   // 折叠 plugin:timeline/* 记录
}
```

`apply` 是**同步 fold**，按 `pluginRecordOf(event)` 分派到 `foldRecord`（`:166-393`），
处理 `plugin:timeline/{tree,import,import-ready,remove,annotation,delivery,reply,priority,select,report,failure}`。

**RPC 通道**（`src/storage.ts:78-106`）：

```ts
ctx.inject(['connection', 'webServer'], (scope) => {
  scope.connection.rpc.handle(TIMELINE_CHANNEL, async (method, payload, signal, peer) => {
    if (peer.principal.kind !== 'owner' || (method !== TIMELINE_EDIT && method !== TIMELINE_LOCALE)) {
      return { ok: false, error: { code: 'timeline/forbidden', ... } }
    }
    ...
  })
})
```

通道名与方法名（`src/protocol.ts:18-23`）：

```ts
export const TIMELINE_CHANNEL = '/timeline'
export const TIMELINE_EDIT = 'edit'
export const TIMELINE_LOCALE = 'locale'
```

#### (c) 客户端半（`src/client/index.ts`，274 行）

**Cordis 服务注入**（`:39-47`）：

```ts
export const inject = [
  'slots', 'locale', 'sidebarRightTabs', 'sidebarRight',
  'configForms', 'connection', 'sessions',
]
```

**它挂了 4 个 slot + 1 个 sidebar-right tab 类型**：

| 挂载点 | 位置 | kind/scope | 注册 key |
|---|---|---|---|
| `tool.call.toolview` | `:101-118` | keyed / session | `key: 'timeline_tasks'`（wire 工具名） |
| `plugins.bundle.config` | `:119-164` | keyed / root | `key: '@deepseek-ai/dsh-timeline'`（bundle 包名） |
| `sidebar.right.pane.tab` | `:232-253` | keyed / session | `key: '@deepseek-ai/dsh-timeline'`（与 tab 类型 id 相同） |
| `conversation.input.dock` | `:254-273` | list / session | `id: 'timeline'`, `order: 20` |

**外加右侧栏 tab 类型注册**（`:165-183`）：

```ts
ctx.effect(
  () => ctx.sidebarRightTabs.register({
    id,                    // '@deepseek-ai/dsh-timeline'
    kind: 'timeline',      // ← 这是"类型"的名字
    priority: 'extension',
    title: () => t('title'),
    guide: [{ id: 'timeline', order: 50, title: () => t('title'), description: () => t('guide'), icon: TimelineIcon }],
  }),
  'timeline: sidebar page',
)
```

**这就是 §5.2「两个 tab」的真实机制**：sidebar-right 是「**类型注册 + keyed 内容**」两段式，
`kind` 是类型名，`sidebar.right.pane.tab` 的 key 是**类型 id**。
一个 `kind` 对应一个 body；要在右栏放两个 tab，就要**两个 kind + 两个 body 注册**。

**Dock 的实现**（`src/client/TaskDock.tsx`）：

```tsx
// TaskDock.tsx:33-74
export function TaskDock({ sessionId, useProjection, useStore, actions, useSettings, useSession, toggleSidebar, removeTree, t }: TaskDockProps) {
  const view = useProjection('timeline')          // ← 标准 kit 的 projection hook
  const tree = view?.trees.find(item => item.id === view.activeTreeId)
  const state = useStore(value => value)
  const settings = useSettings(value => value.value)
  const overall = useMemo(() => measureAll(tree?.tasks ?? [], segmented).get(null), [tree, segmented])
  ...
  if (view === undefined || tree === undefined) return null   // ← 无任务时整条 dock 隐藏
  return (<section className="timeline-dock" ...>)
}
```

`PropsRuntime<'conversation.input.dock'>` 提供的 owner share 里带 `sessionId`（`:27-30`）。
`useProjection('timeline')` 的类型来自 `src/records.ts:318-322` 的声明合并：

```ts
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    timeline: TimelineView
  }
}
```

**客户端半里"读"与"写"的分工**（`src/client/index.ts`）：

- **读** = Session Projection。组件里用 `useProjection('timeline')`；
  `apply` 里因为不是组件，用裸 face：`sessions.binding(sessionId)?.session.projections.faceOf('timeline')`（`:191`）。
- **写** = Remote RPC。`src/client/actions.ts:90-212` 的 `createTaskRequester`：
  - `connection.rpc.call(TIMELINE_CHANNEL, TIMELINE_EDIT, value, controller.signal)`（`:127`）
  - 用户可见动作通过 `sessions.using(sessionId, {source:'timelineTaskAction'}, ...)` 拿到 `SessionFace`，
    再 `session.prompt([{type:'text', text}], current.running ? 'steer' : 'queue', signal)`（`:116-124`）
  - `actions.ts:67-71` 通过 `declare module '@deepseek-ai/dsh-api-session-controller/client'` 声明
    `SessionReferenceSourceMap { timelineTaskAction: unknown }` —— 这是"这条 session 引用是为哪个动作开的"的可类型化溯源。

#### (d) 关键文件:行 清单

| 文件 | 行 | 作用 |
|---|---|---|
| `packages/experimental/timeline/package.json` | 16-31, 44-62 | `exports` + `dsh.client` |
| `packages/experimental/timeline/cordis.patch.yml` | 1-3 | entry `timeline-experimental` |
| `packages/experimental/timeline/tsdown.config.ts` | 1-4 | `clientBundle(...)` 构建预设 |
| `packages/experimental/timeline/src/index.ts` | 17-25, 32-55 | 宿主 apply + 依赖 |
| `packages/experimental/timeline/src/projection.ts` | 65-67, 86-157, 166-393 | 投影注册 / 定义 / fold |
| `packages/experimental/timeline/src/records.ts` | 318-322 | `SessionProjectionMap` 合并 |
| `packages/experimental/timeline/src/storage.ts` | 62-107 | RPC 通道注册 |
| `packages/experimental/timeline/src/protocol.ts` | 18-23, 28-95 | 通道名 / 请求-响应 schema |
| `packages/experimental/timeline/src/config.ts` | 9-51, 53-78, 81+ | Config 接口 / PluginConfig / Schemastery schema |
| `packages/experimental/timeline/src/policy.ts` | 2 | `TIMELINE_CONFIG_ID` |
| `packages/experimental/timeline/src/client/index.ts` | 39-47, 53-273 | 客户端 apply 全貌 |
| `packages/experimental/timeline/src/client/TaskDock.tsx` | 33-134 | dock 组件（§5.1 的参考） |
| `packages/experimental/timeline/src/client/Panel.tsx` | — | 右栏面板（§5.2 的参考） |
| `packages/experimental/timeline/src/client/Settings.tsx` | — | 设置页（§5.5 的参考） |
| `packages/experimental/timeline/src/client/actions.ts` | 90-212 | RPC + session.prompt 组合 |
| `packages/experimental/timeline/src/client/timeline.css` | 1-51 | **token 用法实例**（见 §2.4） |
| `packages/experimental/timeline/src/client/TaskCard.tsx` | — | 工具卡（§5.3 的参考） |

#### (e) Timeline 就是 issue 说的"官方 Timeline"吗？

**是。** 三条证据：
1. 包名 `dsh-timeline`，README 首行 "Timeline"，`docs/preview.svg` 是官方预览图；
2. 它注册进**官方 `web-app` bundle 的插件 roster**（`packages/bundle/web-app/cordis.patch.yml` 的 browser roster 段）；
3. 它的 `cordis.patch.yml` entry 名是 `timeline-experimental`——"experimental"是**官方实验性**命名空间
   （`packages/experimental/` 目录下 40+ 个官方实验包），不是第三方。

**但它对 taskline 的定位是"竞品 + 模板"**：它做的是"任务树 + 进度条 + 定时报告"，
不做"按任务区间折叠压缩"。taskline-ui 要做的是**任务树 + 压缩事件流**，二者在右栏是**同一种 kind 的竞争关系**。

---

### 2.3 真实 slot 清单（0.2.3-alpha.2）

**权威来源**：`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`（6689 行，**131 个 slot** 的完整目录，
每条含 `key` / `kind` / `scope` / `summary` / `doc` / `registerOptions` / `ownerProps` / `occupants` / `source`）。
这是 `cordis-client-runner`（Cordis 插件的客户端 runner）内置的 slot 目录，**任何插件作者都能查**。

#### 规格点名的 slot

| slot id | kind | scope | catalog 行 | 声明文件 | 备注 |
|---|---|---|---|---|---|
| `conversation.input.dock` | `list` | `session` | 1453-1457 | `packages/client/ui-conversation/src/client/contract/slots.ts:305` | owner = `InputZone`；**"输入框正上方、与输入框同宽"成立** |
| `sidebar.right.pane.tab` | `keyed` | `session` | 5244-5249 | `packages/client/ui-sidebar-right/src/client/contract/slots.ts:59-64` | key = tab 类型 id |
| `tool.call.toolview` | `keyed` | `session` | 6426-6431 | `packages/client/ui-tool/src/client/contract/slots.ts:21-25` | key = wire 工具名 |
| `conversation.chat.node` | `keyed` | `session` | 540-545 | `packages/client/ui-chat/src/client/contract/slots.ts:462-469` | key ∈ `ChatNodeKind` |
| `plugins.bundle.config` | `keyed` | `root` | 3527-3532 | `packages/client/ui-plugin-manager/src/client/slot-contract.ts:154-159` | key = bundle npm 包名；**仅 `view:'page'`** |
| `settings.section` | `list` | `root` | 4559-4565 | `packages/client/ui-settings/src/client/contract/slots.ts:80-81` | 0.2.3 起走 `settings.section.view` Factory |
| `settings.plugins.tab` | — | — | **不存在** | — | **0.2.3 已删**（0.2.2 在 `ui-settings/src/client/contract/slots.ts:85`） |
| `settings.launcher` | `single` | `root` | 4194-4199 | `packages/client/ui-settings/src/client/contract/slots.ts:32` | 左栏底部账号启动器 |
| `settings.trigger` | `single` | `root` | 4668-4673 | `packages/client/ui-settings/src/client/contract/slots.ts:48` | **齿轮按钮内容**（左栏底部） |
| `settings.header` | `single` | `root` | 4160-4165 | `packages/client/ui-settings/src/client/contract/slots.ts:54` | 弹层标题文本座 |
| `plugins.tab` | `list` | `root` | 3836-3841 | `packages/client/ui-plugin-manager/src/client/slot-contract.ts:141` | Plugins 页 "Installed" 之后的页签 |
| `plugins.item` | `list` | `root` | — | `packages/client/ui-plugin-manager/src/client/slot-contract.ts:153` | 官方插件卡 |

`conversation.session.header.*` 全族（catalog 2144-2400）：

| slot id | kind | scope | catalog 行 | 声明行 | 用途 |
|---|---|---|---|---|---|
| `conversation.session.header` | `single` | `session` | 2144-2148 | `ui-conversation/.../slots.ts:238-246` | 严格 per-Session 标题 + actions + View 导航 |
| `conversation.session.header.lineage` | `single` | `session` | 2291-2296 | `:247-252` | 面包屑标题替换（**标题区裁剪溢出，overlay 要 portal**） |
| `conversation.session.header.actions` | `list` | `session` | 2185-2190 | `:253-258` | 标题旁动作，**升序**，溢出裁剪+渐隐 |
| `conversation.session.header.utilities` | `list` | `session` | 2336-2341 | `:259-264` | 右对齐工具，升序 |
| `conversation.session.header.corner` | `single` | `session` | 2248-2253 | `:276-281` | 头部最右角，**只放一个控件** |
| `conversation.session.header.views.actions` | `list` | **`root`** | 2400-2405 | `:282-283` | View 页签行的 More 菜单 |

#### `conversation.chat.node` 的 15 个已注册 kind

`packages/client/ui-chat/src/client/conversation-nodes/*.ts`：

```
assistant-step, command, command-input, compaction, context, inherited-history,
manual-compaction, model-retry, question-reply, steering, system-prompt,
tool-call, turn-error, turn-max-tokens, turn-process, turn-tail, turn-trigger, unknown, user, workflow-run
```

（catalog 6426-6431 的 `keyDomain` 字段给出权威清单；
`inherited-history` 是 **0.2.3 新增**，0.2.2 没有。）

> **结论**：issue §5.3「`task_*` / `compress` / `history_*` 工具的调用渲染为紧凑卡片」应走
> **`tool.call.toolview`（keyed by wire name）**，**不是** `conversation.chat.node`——
> 后者的 key 是固定的 `ChatNodeKind` 集合，第三方加不进新的 kind（kind 表由 ui-chat 拥有）。
> catalog 6426-6431 的 `keyDomain` 明写：`open: any string the owner dispatches (no compile-time key set)`。

#### `tool.call.toolview` 已占用的 key（0.2.3）

catalog 6431 的 `keyDomain` 列出：`apply_patch, ask_user_question, bash, cordis_define, cordis_inspect,
cordis_inspect_list, cordis_inspect_query, cordis_inspect_self, cordis_run, cordis_stop, cordis_undefine,
create_goal, edit, get_goal, glob, grep, interrupt_agent, job_kill, job_list, job_output, list_agents,
list_subagent_models, lsp, office_convert, office_recalculate, office_render, present, propose_action, ralph,
read, read_image, schedule_*, send_message, session_event_read, session_event_search, session_event_trace,
session_search, session_send_message, session_trace, skill, spawn_teammate, subagent, subagent_fork,
team_task_*, terminal_*, timeline_tasks, todo_write, update_goal, wait_agent, web_fetch, web_search, workflow, write`

> **`task_start` / `task_rename` / `task_complete` / `task_status` / `compress` / `history_read` / `history_search` 全部未被占用** ✅

#### `conversation.input.dock` 的现有占用者（0.2.3）

| id | order | 归属 | 位置 |
|---|---|---|---|
| `todo` | 0 | `ui-conversation` 的 `TodoDock` | `packages/client/ui-conversation/src/client/skeleton/TodoPanel.tsx:116-117` |
| `queue` | 20 | `ui-conversation` 的 `QueueDock` | `packages/client/ui-conversation/src/client/queue/QueueDock.tsx:398-402` |
| `timeline` | 20 | **官方 Timeline** | `packages/experimental/timeline/src/client/index.ts:254-273` |
| `claude-code-mods` | 20 | `client-ui-claude-code-mods` | `packages/experimental/client-ui-claude-code-mods/src/client/mount.ts:95-99` |
| `goal` | 10 | `ui-goal` 的 `GoalBar` | `packages/client/ui-goal/src/client/index.ts:102-106` |
| `forge-panel.worktree` | 5 | `client-ui-forge` | `packages/experimental/client-ui-forge/src/client/mount.ts:507-509` |

> taskline 需要**自带 `id`（如 `taskline`）与 `order`**（建议 25 或更高，排在 timeline 之后），
> 否则会与 timeline 的 dock 并排出现两条。

#### `sidebar.right.pane.tab` 的现有占用者（0.2.3）

catalog 5244-5299 列出：`timeline Panel`（官方）、`client-ui-sidebar-documentpreview SummaryPreview`、
`experimental-client-ui-forge ForgeTab`（0.2.3 已移除）、`experimental-liveshare ViewerSharePathBody`（已移除）等。
**`taskline` 的 kind 未被占用** ✅

---

### 2.4 设计 token：核实

#### 结论：**`--dsw-alias-*` 是真实 token 族，旧版"一半不存在"的结论是错的。**

定义文件：`packages/client/ui-theme/src/styles/design-platform.css`（511 行）。

结构（4 个块）：

| 块 | 行 | 内容 |
|---|---|---|
| `body {` | 4-89 | **static 色板**（light） |
| `body[data-ds-dark-theme] {` | 90-175 | **static 色板**（dark） |
| `body {` | 176-327 | **alias 语义层**（light） |
| `body[data-ds-dark-theme] {` | 328-477 | **alias 语义层**（dark） |

**alias 语义层共 143 个 `--dsw-alias-*` token**（含 `bg-*` / `border-*` / `brand-*` / `button-*` / `card-*` /
`chart-*` / `code-diff-*` / `file-diff-*` / `hovercard-*` / `illustration-*` / `interactive-*` / `json-tree-*` /
`label-*` / `link` / `markdown-*` / `menu-*` / `scrollbar-*` / `state-*` / `switch-*` / `toast-*` / `tooltip-*` /
`trajectory-*` / `turn-trigger-*`）。

#### issue §5 用到的 token 逐条核实

| issue 里写的 | 0.2.3 真实 token | 定义行（light / dark） | 判定 |
|---|---|---|---|
| `--dsw-alias-label-primary` | ✅ 存在 | `design-platform.css:259` / `:411` | ✅ |
| `--dsw-alias-label-tertiary` | ✅ 存在 | `:262` / `:414` | ✅ |
| `--dsw-alias-chart-tools` | ✅ 存在（→ `--dsw-static-violet-400`） | `:225` / `:377` | ✅ 紫 |
| `--dsw-alias-chart-messages` | ✅ 存在（→ `--dsw-static-blue-450`） | `:223` / `:375` | ✅ 蓝 |
| `--dsw-alias-bg-layer-3` | ✅ 存在 | `:183` / `:335` | ✅ |
| `--dsw-alias-hovercard-state-done` | ✅ 存在（→ violet-400） | `:230` / `:382` | ✅ 紫 |
| `--dsw-alias-hovercard-state-error` | ✅ 存在（→ red-400） | `:231` / `:383` | ✅ 红 |
| `--dsw-alias-static-amber-400` | ❌ **不存在** | 正确名是 **`--dsw-static-amber-400`** | ❌ **1 处名字错** |
| （issue 提到的）"品牌色" | `--dsw-alias-brand-primary` | `:203` / `:355` | ⚠️ light 下 = `--dsw-static-neutral-bluish-1000`（近黑），**不是蓝**；"品牌色"更该用 `--dsw-alias-state-business-primary`（→ deepseek-500 蓝，`:277` / `:429`） |

**补齐建议**（issue 没写但语义上要用）：

| 用途 | token | 定义行 |
|---|---|---|
| 成功（✔ 绿） | `--dsw-alias-state-success-primary`（→ green-500） | `:291` / `:443` |
| 警告（琥珀 chip） | `--dsw-alias-state-warn-primary`（→ amber-500） | `:295` / `:447` |
| 错误（✘ 红） | `--dsw-alias-state-error-primary` | `:288` / `:440` |
| 品牌/进行中（蓝） | `--dsw-alias-state-business-primary` | `:277` / `:429` |
| 细边框 | `--dsw-alias-border-l1` / `l2` / `l3` | `:200-210` 区间 |
| 圆角 | `--dsw-radius-xs` / `sm` / `md` / `lg` / `xl` | 同文件 |
| 字体 | `--dsw-font-xs-13` / `--dsw-font-mono` | 同文件 |

**官方 Timeline 的 token 用法实例**（`packages/experimental/timeline/src/client/timeline.css`）：

```css
/* :2  主文字 */
.timeline-tool-update { color: var(--dsw-alias-label-primary); font-size: var(--dsh-content-font-size,13px); }
/* :4  次要文字 */
.timeline-tool-summary { color: var(--dsw-alias-label-secondary); }
/* :8  卡片边框+圆角 */
.timeline-task-card { border: 0.5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); }
/* :28 状态色：done / active / blocked 三档 */
.timeline-card-task[data-status=done]    .timeline-card-status { color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 70%, var(--dsw-alias-label-primary)); }
.timeline-card-task[data-status=active]  .timeline-card-status { color: var(--dsw-alias-state-business-primary); }
.timeline-card-task[data-status=blocked] .timeline-card-status { color: var(--dsw-alias-state-warn-primary); }
/* :44-50  分段进度条的四档 level 色 */
.dsh-timeline { --timeline-level: var(--dsw-alias-chart-messages); }
.dsh-timeline [data-level="0"] { --timeline-level: var(--dsw-alias-chart-messages); }
.dsh-timeline [data-level="1"] { --timeline-level: var(--dsw-alias-state-success-primary); }
.dsh-timeline [data-level="2"] { --timeline-level: var(--dsw-alias-state-done-primary); }
.dsh-timeline [data-level="3"] { --timeline-level: var(--dsw-alias-state-warn-primary); }
.dsh-timeline [data-level="4"] { --timeline-level: var(--dsw-alias-state-error-primary); }
```

> 这份 CSS 是 issue §5.1「分段进度条四段配色」与 §5.2「状态圆点配色」的**最佳参考**：
> 官方用 `--dsw-alias-chart-messages` / `--dsw-alias-state-success-primary` / `--dsw-alias-state-warn-primary` / `--dsw-alias-state-error-primary`
> 四档，而不是 issue 写的 `chart-tools` / `chart-messages` / `bg-layer-3` / `hovercard-state-error`。

---

### 2.5 客户端数据通道：三种，0.2.3 的准确用法

#### (a) Session Projection（**只读、宿主计算、客户端零逻辑**）

**宿主半**：

```ts
// packages/session/session-projection/README.md:56-79
const definition = {
  key: 'todo',
  stateSchema: todoStateSchema,
  stateVersion: 1,
  init: (header, inheritedEventCount) => ({ items: [] }),
  apply: (state, event) => event.type === 'todo/upsert' ? { items: event.data.items } : state,
  wire: { viewSchema: todoViewSchema, view: state => ({ items: state.items }) },
}
const handle = await ctx.sessionProjections.register(definition)
```

要点（README:70-79）：
- `apply` 必须**同步**，对不关心的事件**返回同一引用**（引用不变 = 下游零工作）。
- `wire` 块缺失 = 该 unit **仅宿主可见**，客户端收不到。
- `init(header, inheritedEventCount)` 拿的是**确切的 fork 继承切点**，不能从 `firstLiveSeq` 推断。
- `wire.view` 的结果按 `Object.is` 比较 → **必须复用引用**才能抑制发布。

**客户端半（两种读法）**：

```ts
// ① 组件内（标准 kit，session scope 才有）——Timeline 的 TaskDock 用这个
const view = useProjection('timeline')            // src/client/TaskDock.tsx:44
const val  = useProjection('goal', v => v?.items.length ?? 0)   // 带 selector 重载

// ② 非组件（apply 里）——Timeline 用裸 face
const source = sessions.binding(sessionId)?.session.projections.faceOf('timeline')
// packages/experimental/timeline/src/client/index.ts:191
```

`UseProjection` 类型（`packages/api/session-controller/src/client/sessions/projection-store.ts:38-45`）：

```ts
export type UseProjection = {
  <K extends Extract<keyof SessionProjectionMap, string>>(key: K): SessionProjectionMap[K] | undefined
  <K extends Extract<keyof SessionProjectionMap, string>, S>(
    key: K,
    selector: (value: SessionProjectionMap[K] | undefined) => S,
    eq?: (a: S, b: S) => boolean,
  ): S
}
```

`undefined` **统一表示"能力不存在"**（宿主 unit 未挂载，或还没有基线/帧携带该 key）。
要让 `useProjection('taskline')` 通过类型检查，必须像 Timeline 那样**声明合并**：

```ts
// packages/experimental/timeline/src/records.ts:318-322
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    timeline: TimelineView
  }
}
```

**客户端 store 语义**（`projection-store.ts:59-91, 152-212`）：
- `sequenced` 行（宿主帧 / 基线）按 **higher seq wins** 合并；`cached` 行（持久化 checkpoint 视图）**永远让位**给 sequenced 行。
- `seed(baseline)` 会先删掉所有 cached 行，再按 seq 落基线。
- 逐 key 的 face 是**身份稳定**的（`faceOf(key)` 每次返回同一对象），所以 React 侧每个 key 只绑定一次。

**Timeline 用的是哪一种？→ 纯读 + 帧驱动，不做客户端折叠。**

#### (b) Remote RPC（**写**，主人权限）

**客户端**（`packages/experimental/timeline/src/client/actions.ts:125-130`）：

```ts
const edit = async (value: UserEdit) => {
  controller.signal.throwIfAborted()
  const result = await connection.rpc.call(TIMELINE_CHANNEL, TIMELINE_EDIT, value, controller.signal)
  if (!result.ok) throw new Error(result.error.message)
  return editResponseSchema.parse(result.value)     // ← 响应也要校验
}
```

**宿主**（`packages/experimental/timeline/src/storage.ts:79-105`）：

```ts
scope.connection.rpc.handle(TIMELINE_CHANNEL, async (method, payload, signal, peer) => {
  if (peer.principal.kind !== 'owner') {
    return { ok: false, error: { code: 'timeline/forbidden', message: '...' } }
  }
  try {
    signal.throwIfAborted()
    return { ok: true, value: await this.edit(editRequestSchema.parse(payload)) }
  } catch (error) {
    if (signal.aborted) throw error
    return { ok: false, error: { code: 'timeline/request-failed', message: ... } }
  }
})
```

**要点**：
1. 宿主侧必须 `ctx.inject(['connection', 'webServer'], ...)`（**webServer 可用才有 RPC**）。
2. **主人门禁**：`peer.principal.kind !== 'owner'` 直接拒（issue §5.4 的"放行入口只对人开放"应落到这条通道）。
3. 双向校验：请求 `editRequestSchema`（zod discriminated union）、响应 `editResponseSchema`。
4. `signal` 贯穿，中止要透传。

**给用户发消息的第二条路**（不是 RPC，是 session 准入）：

```ts
// packages/experimental/timeline/src/client/actions.ts:116-124
const result = await session.prompt(
  [{ type: 'text', text }],
  current.running ? 'steer' : 'queue',     // 运行中 steer，排队 queue
  controller.signal,
)
if (!result.ok) throw new Error(result.error.message)
```

**⚠️ issue §5.4 说"放行入口是 CLI 命令 `/taskline gate off`，不是模型可见的工具"**——
这个设计在 0.2.3 可行，但**更自然的是走 RPC + 主人门禁**（像 Timeline 的 `edit`），
这样浏览器 UI 的"临时放行"按钮可以直接调用，不必发明 CLI 旁路。

#### (c) 事件订阅

0.2.3 的**客户端事件订阅**主通道是 **Session Controller 的控制帧**（`packages/api/session-controller/src/client/`）：
`manager.ts:787-834` 处理 `change.page.projections` 与投影帧，`session.ts:211` 订阅 `projections.faceOf('inbox')`。
**插件不需要自己发明事件总线**——把状态做成 projection，帧会自动推。

宿主侧的 Cordis 事件（`ctx.on(...)`）只在**插件宿主半内部**用，不跨到客户端。

**Timeline 三者混用**：
- 读状态 → **Session Projection**（`useProjection('timeline')`）
- 写用户动作 → **Remote RPC**（`connection.rpc.call('/timeline', 'edit', ...)`）
- 让 agent 知道 → **session.prompt**（steer/queue），不是 RPC
- 浏览器语言同步 → **Remote RPC**（`connection.rpc.call('/timeline', 'locale', ...)`，`src/client/index.ts:71`）

---

### 2.6 壳结构：左会话栏 + 顶栏 + 正文 + 输入区；齿轮位置

#### slot 层级（0.2.3）

```
root (single/root)                             packages/client/ui-renderer/src/client/registry.ts:29-44
├─ sidebar (single/root)                       左栏
│  ├─ sidebar.brand.mark / sidebar.brand.name
│  ├─ sidebar.panellist (list)                  主面板图标列表（含 Plugins）
│  ├─ sidebar.workspaces (single/root)          工作区/会话列表（ui-workspace 注册）
│  ├─ sidebar.settings (single/root)            ★ 设置座（左栏底部）
│  │   └─ settings.trigger (single/root)       ★★ 齿轮（IconSettingsOutlineMedium）
│  │   └─ settings.launcher / settings.notice
│  └─ sidebar.footer.action (list)
├─ main (keyed/root)                           中央主面板
│  ├─ 'conversation' → main.conversation (single/session-maybe)
│  │   └─ conversation.session (single/session)
│  │       ├─ conversation.session.header (single/session)   ← 顶栏（会话标题/动作）
│  │       │   ├─ .lineage / .actions / .utilities / .corner
│  │       ├─ conversation.view (list/session)
│  │       │   └─ conversation.chat.flow (single/session)
│  │       │       └─ conversation.chat.node (keyed/session)
│  │       └─ conversation.composer (chain/session)          ← 输入区（chain！）
│  │           └─ conversation.composer.bar (single/session-maybe)
│  │       ※ conversation.input.dock (list/session)          ← ★ dock，在 composer.bar 正上方
│  │       ※ conversation.input.overlay / .composer.dock / .input.left / .input.right
│  └─ 'plugins' → Plugins 主面板
└─ rightbar (single/root) → rightbar.session (single/session)   ← 右侧栏
    └─ sidebar.right.pane.tab (keyed/session)
```

**dock 渲染顺序**（`packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx:179-184`）：

```tsx
<div className={clsx(css.composerStack, hero && css.composerHero)}>
  {hero && <HeroShell t={t} renderSlot={renderSlot} headline={props.headline} />}
  {hero && heroWorkspaceRow}
  {zone !== undefined && renderSlot('conversation.input.dock', zone)}   {/* ← dock 在上 */}
  {inputBar}                                                            {/* ← 输入框在下 */}
</div>
```

> ✅ **issue §5.1「紧跟在输入框上方，与输入框同宽」成立**。
> `conversation.input.dock` 的 owner 是 `InputZone`（`ui-conversation/.../contract/slots.ts:305`），
> 拿到的是输入区的宽度信息。
> ⚠️ 注意 catalog 1457 的提醒：**"fixed overlays must portal to the document body because the docked composer contains them"**
> —— dock 里的 fixed 定位浮层必须 portal 到 `document.body`，否则被 composer 的 `overflow` 裁掉。

#### 齿轮的真实位置：**左栏底部，不是顶栏**

`packages/client/ui-settings-general/src/client/chrome.tsx:1-31`：

```tsx
/**
 * Shell chrome content registered into the shell's trigger/header seats:
 * the trigger row icon + label (figma sidebar foot) and the panel title text.
 */
export function TriggerContent({ wide, t }: TriggerContentProps) {
  return (<>
    <IconSettingsOutlineMedium size={wide ? 16 : 18} />
    {wide && <span className={css.triggerLabel}>{t('trigger')}</span>}
  </>)
}
```

`packages/client/ui-settings-general/src/client/SettingsRoot.tsx:233-250`：

```tsx
<div className={clsx(css.triggerRow, !wide && css.railRow)}>
  {renderSlot('settings.launcher', { wide, settingsOpen: open, openSettings, ... })}
  <ConnectionIndicator ... />
</div>
```

`settings.trigger` 的 slot 文档（`packages/client/ui-settings/src/client/contract/slots.ts:40-48`）：

> **The sidebar-foot trigger row content**: icon + label, supplied as slot content
> (the accessible name comes from the content — rail state renders the label visually hidden).
> The shell renders the button chrome and owns open state.

> ❌ **issue §5.5「点击顶栏齿轮打开」不成立**。设置入口在**左栏底部**（收起成 rail 时是 56px 侧栏的底部图标）。

#### 右侧栏宽度

`packages/client/ui-sidebar-right/src/client/shell/SidebarRight.module.css:31-38` 用自定义属性
`--dsh-sidebar-right-panel-width` 控制宽度，**不是固定 320px**，且布局会被持久化
（`packages/client/ui-sidebar-right/src/client/persistence.ts`）。
issue §5.2 的"宽 320px，左边框 1px 分隔线"**不成立**——宽度由壳决定且可拖动。

---

### 2.7 新版 UI 变化清单（0.2.2-rc.5 → 0.2.3-alpha.2，只列影响规格的）

用 `git diff dsh-v0.2.2-rc.5 dsh-v0.2.3-alpha.2` 对比
`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`（131 slot 全量）+ `packages/client/` 包清单得出。

| # | 变化 | 对 §5 的影响 |
|---|---|---|
| 1 | **`settings.plugins.tab` 被删除**；连 `packages/client/ui-settings-plugins` 与 `packages/client/ui-settings-plugin-inventory` 两个包一起删除。Plugins 从"设置里的一个分区"升级为**独立主面板**（`main` slot 的 `'plugins'` key） | ❌ **issue §5.5 引用的 slot 已不存在**。新路径：`plugins.bundle.config`（bundle 详情页内）或 `settings.section`（设置导航项） |
| 2 | **`settings.section` 改为由 `settings.section.view` Factory 承载**（catalog 4560-4565；声明方从 `sidebar.settings` entry 变成 Factory 定义）。且 Plugins 页也会为「注册方模块所在 bundle」显示入口 | §5.5 的"双栏弹层 + 左栏导航"**仍然成立**——`settings.section` 就是左栏导航项；但要按新 Factory 规则注册 |
| 3 | **新增 `conversation.chat.aside`**（single / session，`ui-chat/.../slots.ts:446-447`）：会话级、贴在正文旁边的占位区（摘要面板一类） | §5.4 的"门禁拒绝提示条"如果想**常驻**在正文旁，这是 0.2.3 的正解；但若只想跟随某次 compress 调用，走 `tool.call.toolview` 更准 |
| 4 | **新增 `conversation.session.panel.*` 4 个 slot**（`.environment.row` / `.indicator` / `.section` / `.section.actions`，均 list 或 keyed / session） | 会话面板（Session panel）成为常驻侧栏；taskline 的任务树可以放这里，也可以放右栏（issue 选右栏，更贴近 Timeline） |
| 5 | **`conversation.session.header.utilities` 占用者更换**：`experimental-client-ui-forge HeaderButton id 'forge-panel'` → `client-ui-session-panel SessionPanelToggle id 'session-panel'`；`.actions` 少了 `job-list` 与 `subagent-catalog` | §5 的"打开任务树"按钮若想放顶栏，`conversation.session.header.actions` / `.utilities` 仍可用，但**位置竞争更激烈** |
| 6 | **`conversation.chat.node` 新增 kind `inherited-history`**（`ui-chat/.../conversation-nodes/inherited-history.ts`） | 无直接影响，但 `ChatNodeKind` 表变了，写死 kind 列表的代码要更新 |
| 7 | **`tool.call.toolview` 新增占用 key**：`timeline_tasks`（官方 Timeline）、`cordis_inspect`、`session_send_message`；`session_event_trace` 被移除 | §5.3 的 `task_*` / `compress` / `history_*` 仍全部可用 ✅ |
| 8 | **新增客户端包**：`ui-action-cards`、`ui-connector-account`、`ui-creation-recommendations`、`ui-plugin-recommendations`、`ui-session-panel`、`ui-session-status`、`remote-connection`、`script-realm(-iframe)`、`config` | `ui-session-panel`（会话面板）值得 taskline 关注——它是 0.2.3 的新"常驻侧栏"形态 |
| 9 | **删除客户端包**：`ui-settings-plugin-inventory`、`ui-settings-plugins` | 见 #1 |
| 10 | **`sidebar.panellist.trailing` 新增**（list / root / inline） | 无直接影响 |

> 另外：`useSessionStatus` 这个标准 kit hook 在 0.2.3 已进入所有 session-scope slot 的标准 props
> （`packages/client/ui-session-status/src/client/status.ts:36-38`），
> 可用于 dock 显示会话状态（如"运行中/空闲"）。

---

## ③ 不一致与真实机制（issue §5 必须改写的地方）

### 3.1 §5.1 Dock —— 挂载点成立，但有三个坑

| issue 原文 | 真实机制 | 改写建议 |
|---|---|---|
| "与官方 Timeline 的 `conversation.input.dock` 同一挂载点" | ✅ **完全正确**。Timeline 的 dock 注册在 `packages/experimental/timeline/src/client/index.ts:254-273`：`{ name:'conversation.input.dock', id:'timeline', order:20, locale:'timeline', store:viewStore }` | 保留。但要补：**必须自带 `id` 与 `order`**（如 `id:'taskline'`, `order:25`），否则与 timeline 的 dock 并排 |
| "第二行：分段进度条……已完成（`--dsw-alias-chart-tools` 色）" | `--dsw-alias-chart-tools` 存在（violet-400），但官方 Timeline 的四档是 `--dsw-alias-chart-messages` / `--dsw-alias-state-success-primary` / `--dsw-alias-state-warn-primary` / `--dsw-alias-state-error-primary`（`timeline.css:44-50`） | 建议改用官方四档，避免与 Timeline 视觉撞车 |
| "无任务时整条 dock 隐藏" | ✅ 有现成模式：`TaskDock.tsx:74` `if (view === undefined || tree === undefined) return null` | 保留 |

### 3.2 §5.2 右侧边栏 —— "两个 tab" 的机制要重写

**真实机制（两段式）**：

```
① ctx.sidebarRightTabs.register({ id, kind, priority, title, guide })
   → 注册一个"类型"（tab-registry.ts:253-281）
   → priority 决定谁在位：'extension'(3) > 'builtin'(2) > 'fallback'(1)
   → 一个 kind 同时只能有一个在位者；extension 可以接管 builtin

② ctx.slots.register({ name:'sidebar.right.pane.tab', key: id }, Panel)
   → 为该类型提供"内容"（key 必须等于 ① 的 id）
   → sidebar.right.pane.tab 是 keyed/session，key 域是开放字符串
```

**因此 issue §5.2 的「顶部：两个等宽 tab——"任务"和"压缩事件"」应改为**：

- 两种做法：
  - **(A) 两个 kind**：`kind:'taskline-tasks'` + `kind:'taskline-events'`，各注册一个 `sidebar.right.pane.tab` body。
    官方 Timeline 只有一个 kind（`'timeline'`），其内部用 `state.tab` 自己切（`TaskDock.tsx:64` `state.tab === 'tasks'`），
    右栏面板 `Panel.tsx` 内部渲染 Reports/Tasks 两个页签。**这是最省事的做法，推荐**。
  - **(B) 一个 kind + 内部自绘页签**：跟 Timeline 一致，`TaskDock` 点"压缩事件"时切 `state.tab`。
- **右栏 tab 的标题**还可以单独注册 `sidebar.right.pane.tab.title`（keyed/session，catalog 5304-5309），
  用于动态标题（如"压缩事件 (12)"）。
- ⚠️ 右栏**不是固定 320px**：宽度由 `--dsh-sidebar-right-panel-width` 决定并持久化。

### 3.3 §5.3 工具卡 —— 走 `tool.call.toolview`，不是 `conversation.chat.node`

- `tool.call.toolview`（keyed/session，key = **wire 工具名**）是工具调用的**唯一可扩展点**。
  `conversation.chat.node` 的 key 域是 `ChatNodeKind` 固定表，第三方**加不进新 kind**。
- 官方 Timeline 正是这么做的（`src/client/index.ts:101-118`，`key: 'timeline_tasks'`），
  组件是 `TaskCard.tsx`。
- 卡片阶段数据由 `ToolCallOwnerProps` 提供（`packages/client/ui-tool/src/client/contract/slots.ts:53-80`）：
  `phase: 'preparing' | 'start' | 'result'`，`block` 分别是 `PreparingToolCall` / `StartedToolCall` / `ToolResultNode`，
  外加 `useDisclosure` / `callId` / `toolName` / `cwd` / `home` / `openFile` / `loadImage` / `inspect`。
  → §5.3 的"头行：工具名 + 参数摘要 + 状态标签 / 体行：入参 JSON + 返回摘要"**完全可实现**。

### 3.4 §5.4 门禁拒绝提示条 —— 有三条路，推荐走工具卡

| 方案 | slot | 优点 | 缺点 |
|---|---|---|---|
| **A（推荐）** | `tool.call.toolview` 的 `compress` key | 跟随那次 compress 调用，天然定位；拒绝理由就在 tool result 里 | 需要 `compress` 工具名确定 |
| B | `conversation.chat.aside`（**0.2.3 新增**，single/session） | 会话级常驻横幅 | 语义是"贴在正文旁的常驻面板"，不是"事件流里的一条" |
| C | 自建 `conversation.chat.node` | — | **不可行**：kind 域固定，第三方加不进新 kind |

**"放行入口只对人开放"**：
- ❌ issue 说走 CLI `/taskline gate off`；
- ✅ **推荐走 Remote RPC + 主人门禁**（`peer.principal.kind === 'owner'`，见 `storage.ts:81-85`），
  浏览器 UI 的按钮直接 `connection.rpc.call('/taskline', 'gate-off', ...)`。
  这样"模型不可见"是**结构保证**（模型没有这个工具），不是约定。

### 3.5 §5.5 设置页 —— slot 要换，齿轮位置要改

| issue 原文 | 0.2.3 真实 | 改写 |
|---|---|---|
| "双栏弹层（点击顶栏齿轮打开）" | 双栏弹层 ✅ 是既有壳；齿轮在**左栏底部**（`settings.trigger`） | 改成"点击左栏底部齿轮" |
| "左栏：垂直导航（常规 / 插件·dsh-taskline / 模型）" | ✅ `settings.section` 就是左栏导航项（list/root，owner 有 `close`）。**Plugins 页也会为你的模块显示一个入口**（catalog 4564 的 doc） | 保留，但注意 0.2.3 起 `settings.section` 走 `settings.section.view` Factory |
| "设置项读出全部配置项" | `ctx.configForms.get<Config>(<entry id>)` — Timeline 用 `TIMELINE_CONFIG_ID = 'timeline-experimental'`（`src/policy.ts:2`），**entry id 来自 `cordis.patch.yml`** | 用 taskline 自己的 entry id |
| "与 `--dump-config` 同源" | ✅ 成立：Schemastery schema（`src/config.ts:81+`）就是宿主配置源，`configForms` 从同一份 `settings.describe()` 派生（`packages/client/ui-settings/src/client/config-form.ts:181-219`） | 保留 |
| （隐含）"设置页在插件详情里" | 官方 Timeline 用 `plugins.bundle.config`（keyed/root，key = **bundle npm 包名**），渲染在 Plugins 页的 bundle 详情页上（`view:'page'`） | **二选一**：`plugins.bundle.config`（跟 Timeline 一致，最省事）**或** `settings.section`（左栏独立入口） |

**建议**：**同时**做两处——
`plugins.bundle.config`（用户在 Plugins 页点开 bundle 就看到）**+**
`settings.section`（设置左栏有独立导航项），因为 issue §5.5 的 ASCII 图明显是"设置弹层里的一个分区"。

### 3.6 §2 package.json 模板 —— 三处要改

```jsonc
// issue §2 的模板
{
  "main": "./src/index.js",                         // ❌ 0.2.3 指向 lib/
  "exports": { ".": "./src/index.js" },             // ❌ 0.2.3 指向 lib/ + types
  "dsh": {
    "manifestVersion": 1,                            // ✅
    "kind": "plugin",                                // ❌ 不在 DshManifest 里
    "bundle": { "patch": "./cordis.patch.yml" },     // ✅
    "capabilities": [],                              // ❌ 不在 DshManifest 里
    "labels": []                                     // ❌ 不在 DshManifest 里
  }
}
```

`DshManifest` 的**全部**字段（`packages/util/package-manifest/src/types.ts:31-41`）：
`manifestVersion?` / `bundle?` / `profile?` / `client?`。多余的 `kind` / `capabilities` / `labels` 不会被读，
但也不该写进规格。

**还需要补的**（0.2.3 官方形态）：
- `exports["./client"]` → `{ types: "./lib/types/client/index.d.ts", default: "./lib/client.js" }`
- `exports["./cordis.patch.yml"]` → `"./cordis.patch.yml"`
- `exports["./locale/*.json"]` → `"./locale/*.json"`（多语言字典）
- `files` 要含 `lib/index.js` / `lib/client.js` / `lib/types/**/*.d.ts`
- `dsh.client.platform: 'web'` + `dsh.client.inject: [...]`（包名列表）
- 构建：`tsdown.config.ts` 用 `clientBundle(import.meta.dirname, ['lib/types/index.js'], { hostPhase: true })`

---

## ④ 需实测（源码定不了、必须在运行实例上验证的）

> 以下每条都**不能**从源码单独确定，必须在 **DSH 0.2.3-alpha.2.plus.1 桌面版**或隔离实例上验证。
> 验收时按 `~/.dsh/AGENTS.md` 规则：**不退出/重启用户正在运行的桌面应用**，用
> `DSH_HOME` + 独立端口 + `DSH_DESKTOP_NO_SINGLETON=1` 起隔离实例。

| # | 待验证项 | 怎么验 | 为什么要验 |
|---|---|---|---|
| 1 | `conversation.input.dock` 多条目并存的实际视觉（todo order 0 / goal 10 / queue 20 / timeline 20 / taskline 25） | 装一个最小 taskline-ui 壳，看 dock 叠放顺序与间距 | `order` 相同时的稳定排序规则只在 `slots.register` 的实现里，没有文档化 |
| 2 | 右栏多个 kind 并存时的 tab 条排布与"两个等宽 tab"是否可达 | 注册两个 kind + 两个 body | issue §5.2 的"两个等宽 tab"在真实右栏里可能变成"两个独立 tab chip"，视觉不同 |
| 3 | `plugins.bundle.config` 的实际渲染位置（bundle 详情页的哪一段） | 装 taskline 后开 Plugins → 找到 bundle → 打开详情 | catalog 只说"rendered on the bundle's page between its description and its rows" |
| 4 | `settings.section` 注册后，**Plugins 页同时出现**的那条入口的实际外观与点击行为 | 同上 | catalog 4564 提到但没细说 |
| 5 | 设置弹层在 `settings.section` 下的**双栏宽度与分区标题** | 同上 | issue ASCII 图的"常规/插件·dsh-taskline/模型"三行是否与真实导航一致 |
| 6 | `conversation.chat.aside` 的实际几何（贴正文右侧的零高图层，`--dsh-chat-aside-gutter`） | 注册一个占位看位置 | 若 §5.4 走这条方案，位置必须实测 |
| 7 | `tool.call.toolview` 的 `phase:'result'` 时 tool result 的实际结构（拒绝理由从哪个字段读） | 触发一次被拒的 compress 看 payload | catalog 说 "lazy, possibly partial `args`"；result 的形状要看 `ToolResultNode` |
| 8 | Remote RPC 的**延迟与可达性**：桌面版 + Web 浏览器双端 | 从浏览器点一个触发 RPC 的按钮 | `storage.ts:78` 的 `ctx.inject(['connection','webServer'])` 要求 webServer 在场 |
| 9 | `useProjection('taskline')` 的**首帧时序**：baseline 何时到达、dock 是否先闪一下空态 | 冷启动一个会话 | `projection-store.ts:194-211` 的 `seed` 会清 cached 行，存在首帧 undefined 窗口 |
| 10 | `--dsw-alias-*` token 在**实际主题**下是否全部有值（尤其 `--dsw-alias-bg-layer-3` 在深色下的对比度） | 切浅/深主题目视 | token 有定义 ≠ 对比度达标 |
| 11 | `dsh.client.inject` 里列的包名**必须存在于目标 profile 的安装集** | 在目标 profile 下装 taskline | 缺包会在激活期报 bundle 缺失（`packages/client/modules/README.md:100` 附近） |
| 12 | 旧会话（0.2.2 时代）打开时 taskline 投影的 `stateVersion` 兼容 | 用旧会话重开 | `projection.ts:91` `stateVersion: 9` 是 checkpoint 失效键，taskline 需要自己的版本号 |

---

## ⑤ 来源

### 5.1 DSH 源码（一手）

**仓库**：`/Users/mutou/vault/projects/deepseek-harness`
**commit**：`4b399c39a6d1479cd84ca591b4d7c88e24d38a96`（2026-11-22 16:50:28 +0800，
"Merge pull request #8961 from deepseek-harness/worktree-release-dsh-0.2.3-alpha.2"）
**version**：`0.2.3-alpha.2`（根 `package.json:3`）
**对照 tag**：`dsh-v0.2.2-rc.5`（旧基线）、`dsh-v0.2.3-alpha.2`

| 主题 | 文件:行 |
|---|---|
| slot 全量目录（131 slot） | `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`（6689 行） |
| slot 类型系统（kind/scope/cardinality） | `packages/client/ui-slots/src/index.ts:100-140`（`SlotKind` / `SlotScope`） |
| slot 注册与注入语义 | `packages/client/ui-renderer/src/client/registry.ts:233-295`（`inject`）、`:499-522,766-773`（`register`） |
| 官方 Timeline 全包 | `packages/experimental/timeline/**`（`package.json` / `cordis.patch.yml` / `src/` / `src/client/` / `docs/DETAIL.md` / `README.md`） |
| 客户端插件机制 | `packages/client/modules/README.md`（全篇）、`packages/client/modules/src/client/manifest.ts:1-30,182-202,238-335` |
| 客户端构建 preset | `packages/client/tsdown.client.ts:1-18,129-169` |
| 包清单类型 | `packages/util/package-manifest/src/types.ts:31-100` |
| Session Projection | `packages/session/session-projection/README.md`、`packages/session/session-projection/src/types.ts:11-73` |
| 客户端投影 store | `packages/api/session-controller/src/client/sessions/projection-store.ts:29-45,59-91,152-212` |
| projection 标准 kit | `packages/client/ui-session/src/client/index.ts:135-169` |
| Session Controller（帧/基线） | `packages/api/session-controller/src/client/sessions/manager.ts:439,611-653,787-834`、`sessions/session.ts:171-180,205-211` |
| 设置表单服务 | `packages/client/ui-settings/src/client/config-form.ts:223-328` |
| 设置 slot 契约 | `packages/client/ui-settings/src/client/contract/slots.ts:30-116` |
| 设置壳与齿轮 | `packages/client/ui-settings-general/src/client/chrome.tsx:1-31`、`SettingsRoot.tsx:225-262` |
| 插件管理器 slot 契约 | `packages/client/ui-plugin-manager/src/client/slot-contract.ts:132-186` |
| 右栏 tab 注册表 | `packages/client/ui-sidebar-right/src/client/tab-registry.ts:93-139,229-281` |
| 右栏 slot 契约 | `packages/client/ui-sidebar-right/src/client/contract/slots.ts:59-64` |
| 对话 slot 契约 | `packages/client/ui-conversation/src/client/contract/slots.ts:219-373,375-398` |
| dock 渲染顺序 | `packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx:160,179-184` |
| Chat node slot | `packages/client/ui-chat/src/client/contract/slots.ts:402-469`、`contract/chat-nodes.ts:23-35` |
| 工具调用 slot | `packages/client/ui-tool/src/client/contract/slots.ts:15-40,53-86` |
| 设计 token | `packages/client/ui-theme/src/styles/design-platform.css`（4-89 static light / 90-175 static dark / 176-327 alias light / 328-477 alias dark） |
| 主题 token 用法实例 | `packages/experimental/timeline/src/client/timeline.css:1-51` |
| HMR | `packages/client/hmr/README.md:30-36`、根 `package.json:227` |
| 宿主注入 `__DSH_BOOT__` | `docs/subsystems/client-modules.md:5-11`、`packages/host/webserver/tests/webserver.spec.ts:1110-1130` |
| 裸 Vite 拒绝 standalone | `apps/web/vite.config.ts:12-14` |
| Web 客户端与插件 roster | `packages/bundle/web-app/cordis.patch.yml:32-36,236-241` |

### 5.2 被审查的规格

- `hyperion2144/dsh-taskline` issue #1，`gh issue view 1 --repo hyperion2144/dsh-taskline --json body -q .body`
- 本次只审 §5（UI）与 §2（package.json 模板）的交叉部分。

### 5.3 版本对比方法

```bash
cd /Users/mutou/vault/projects/deepseek-harness
git diff dsh-v0.2.2-rc.5 dsh-v0.2.3-alpha.2 -- packages/extensions/cordis-client-runner/src/client/slot-catalog.ts
git diff --stat dsh-v0.2.2-rc.5 dsh-v0.2.3-alpha.2 -- packages/client/
diff <(git ls-tree -d --name-only dsh-v0.2.2-rc.5 packages/client/) \
     <(git ls-tree -d --name-only dsh-v0.2.3-alpha.2 packages/client/)
```

### 5.4 未做的事

- 未修改 DSH 源码；未在 DSH 仓库做任何 git 写操作。
- 未启动/退出/重启用户正在运行的桌面版 `DSH Desktop Plus`。
- 未实测 §④ 的 12 项（这些必须在隔离实例上跑，本轮只做源码级核实）。
- 未读 `billion-context` 源码（属 04 号报告范围）。
