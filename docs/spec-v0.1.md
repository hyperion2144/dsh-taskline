# dsh-taskline v0.1 规格（spec v2）

> 取代 [issue #1](https://github.com/hyperion2144/dsh-taskline/issues/1)。决策依据：需求地图 #2、研究 `docs/research/01–04`、UI 原型 `docs/prototypes/ui-v0.1.html`。
> 目标环境：DSH `0.2.3-alpha.2`（`>=0.2.2-0 <0.3.0`）；bili `0.1.216`。

## Problem Statement

长会话里，上下文压缩是“按 token 压力折一段”，它不知道哪段是一个完整的工作单元：可能把做到一半的工作折掉，用户也看不见折了什么、为什么折。现有任务类功能（Todo、plan、Timeline）解决的是“计划与汇报”，不负责回答“这次压缩折的是哪段工作”。

用户需要的是：agent 做的每件事都自动归属到一个有边界、可追溯、可在界面上看见的任务；任务的边界就是上下文的区间；压缩只折已完成的任务区间，跨过进行中的任务时要裁边并说清楚跳过了什么。

## Solution

一个 DSH 插件组合包 `dsh-taskline`，给会话引入任务模型：

- 每个工作单元是一个任务，带标题、状态、surface 区间、可选的父子嵌套；任务以插件记录写进会话日志，恢复/fork 后重建。
- 输入框上方有 dock 展示当前任务与进度，右栏有任务树与压缩事件；`task_*` 与 `compress` 工具在会话流里渲染成紧凑卡片。
- 压缩是附带的、可关闭的特性：不接管 `ctx.compaction`，只按任务区间驱动 DSH 原生压缩或 bili 的 wire 级压缩；跨 open 任务时裁边并报告。
- 与官方 Timeline、Todo、plan 并存，不接管它们的工具与界面语义。

## User Stories

1. 作为 agent，我希望每次开始一段工具驱动的工作时自动归属到一个任务，这样我不需要额外记账就能有工作单元。
2. 作为 agent，我希望在没有 open 任务且连续工具调用达到阈值时才自动建任务，这样不会为每个 read 产生噪音任务。
3. 作为 agent，我希望显式调用 `task_start` 建任务，这样重要工作可以有准确的名字。
4. 作为 agent，我希望调用 `task_rename` 改任务名，这样自动推断的名字可以被纠正。
5. 作为 agent，我希望调用 `task_complete` 关闭任务，这样它成为可压缩的已完成区间。
6. 作为 agent，我希望调用 `task_abandon` 放弃任务，这样失败或中断的工作不会伪装成完成。
7. 作为 agent，我希望对已完成/已放弃的任务调用 `task_reopen`，这样误关的任务可以继续。
8. 作为 agent，我希望 `task_start` 接收 `parentTaskId` 建子任务，这样复杂工作可以拆分。
9. 作为 agent，我希望嵌套深度受 `nesting.maxDepth` 限制并在超限时得到可读拒绝，这样不会产生失控的层级。
10. 作为 agent，我希望自动创建的任务永远是根任务，这样层级只来自我的显式决定。
11. 作为 agent，我希望父任务在有 open 子任务时不能被关闭，这样不会留下悬挂子任务。
12. 作为 agent，我希望父任务放弃时级联放弃 open 子任务，这样清理是显式的。
13. 作为 agent，我希望 `task_status` 返回 open/最近关闭任务与区间摘要，这样我能判断该收口哪个任务。
14. 作为用户，我希望在输入框上方看到当前任务名、状态与分段进度，这样不用打开面板就知道 agent 在做什么。
15. 作为用户，我希望 dock 可以折叠成单行，这样它不长期占用输入区空间。
16. 作为用户，我希望点击 dock 打开右栏任务树，这样能从概览进入细节。
17. 作为用户，我希望任务树显示每个任务的区间、token 估算与压缩状态，这样我知道哪些内容已被折叠。
18. 作为用户，我希望嵌套任务以缩进和深度徽标呈现、可折叠，这样层级结构可读。
19. 作为用户，我希望右栏有“压缩事件”视图，列出每次落盘、裁边、失败的时间与范围，这样压缩是可见的。
20. 作为用户，我希望压缩请求跨过 open 任务时只压已关闭的连续段，并明确列出跳过的范围与任务，这样进行中的工作不会被折掉。
21. 作为用户，我希望 `/taskline gate off` 能临时放开裁边，这样我可以在明确知情时强制压缩；且只有我能调用。
22. 作为用户，我希望压缩可以整体关闭（`compaction.enabled=false`），这样我不需要这个特性时不产生任何 taskline 驱动的压缩。
23. 作为用户，我希望在 native 与 bili 两个压缩后端之间切换，这样能按环境选择日志压缩或 wire 级压缩。
24. 作为用户，我希望 bili 后端在版本或协议不匹配时自禁用并说明原因，而不是报错或静默失效。
25. 作为用户，我希望任务树与压缩状态在读 Session Projection 得到、通过 Remote RPC 写动作，这样界面与宿主状态一致。
26. 作为用户，我希望 fork 会话时已完成任务随历史复制、open 任务标为继承，这样分支不会丢失工作上下文。
27. 作为用户，我希望 resume 后任务树与压缩状态从日志重建，这样重启不会破坏任务模型。
28. 作为用户，我希望卸载插件后会话日志仍然自洽可读，这样插件是真正可装卸的。
29. 作为用户，我希望配置从插件页进入、在插件详情里修改并即时生效，这样与官方插件的操作习惯一致。
30. 作为用户，我希望嵌套层数、自动创建、压缩开关/后端/阈值/延迟等配置齐全且非法值被拒绝，这样我不需要改配置文件。
31. 作为用户，我希望 taskline 与 Timeline、Todo、plan 并存，不抢它们的工具或界面位置。
32. 作为维护者，我希望 bili 版本被精确锁定、升级必须显式，并有周级上游 tag 检查，这样适配不会悄悄漂移。
33. 作为维护者，我希望在隔离的 `DSH_HOME` 与 `taskline-dev` profile 上跑 headless 验收，这样不会污染日常使用的 profile。
34. 作为维护者，我希望用 mock LLM 脚本化跑完整的任务-压缩链路并断言会话日志，这样测试不依赖真实模型与网络。

## Implementation Decisions

### A. 产品边界

- **定位 A（上下文区间视角）**：主件是任务管理，但切入点固定为“自动归属的工作单元 + surface 区间 + 区间决定压缩/裁边”。不做计划、汇报、进度编辑——这些属于 Timeline。
- 与 Todo、plan、Timeline 并存；不注册它们的工具，不占用它们独占的界面语义。
- 单人单会话范围；多 agent / 子会话的任务归属不在 v0.1。

### B. 包与装载

6 个包，pnpm workspace：

| 包 | 职责 | 声明 `dsh.bundle` |
|---|---|---|
| `dsh-taskline` | 组合包，只装不写代码 | 是（唯一） |
| `dsh-taskline-core` | 任务模型、工具、插件记录、pre-step 提示、裁边接口 | 否 |
| `dsh-taskline-ui` | 宿主半（projection / RPC / 设置）与客户端半（lazy-CJS bundle） | 否 |
| `dsh-taskline-compactor` | 压缩后端注册表、触发策略、native 驱动 | 否 |
| `dsh-taskline-bili` | 携带 billion-context（精确 npm 依赖 `0.1.216`）并暴露 `bili:runtime` | 否 |
| `dsh-taskline-bili-adapter` | bili ↔ DSH 适配器：映射、`compress` 驱动、状态回读 | 否 |

- 组合包装载顺序：core → compactor → bili → bili-adapter → ui。
- 组合包 patch 负责 `compaction-basic` / `command-compact` 的处置（具体形态归 compactor 决策），子包不得改别人的 entry。
- 依赖：`@deepseek-ai/*` 与 `@deepseek-ai/schemastery` 走 peerDependencies（宿主提供）；不复制第二份 DSH 内部包。
- `engines.node >=24.9.0`；`engines.dsh >=0.2.2-0 <0.3.0` 在**顶层**。
- 客户端 bundle 用构建工具产出 lazy-CJS（`window.__ModuleLoader__.load({id,factory})`），宿主走 ESM。

### C. 任务模型

```ts
type TasklineEvent =
  | { op: 'create'; task: TaskSeed }
  | { op: 'rename'; id: string; title: string; atSeq: SessionSeq }
  | { op: 'complete'; id: string; outcome: 'completed' | 'abandoned'; end: TaskBoundary }
  | { op: 'reopen'; id: string; atSeq: SessionSeq }
  | { op: 'fork'; inheritedOpenIds: string[] }

interface TaskRecord {
  id: string                 // t-1、t-1.1、t-1.1.1
  title: string
  state: 'open' | 'completed' | 'abandoned'
  parentTaskId: string | null
  autoCreated: boolean
  inherited?: boolean
  start: TaskBoundary
  end?: TaskBoundary
  tokensAtClose?: number
}

interface TaskBoundary { atSeq: SessionSeq; anchorSeq: SessionSeq }
```

- 记录逐动作追加，任务树由日志 fold；不存全量快照。
- 锚点必须是 surface 节点；`anchorSeq` 按“`seq <= atSeq` 的最后一个 surface 节点”解析。
- 一切交叠、可见性、压缩状态判定**只用 surface 位置**，绝不做数字 seq 比较。
- 锚被压缩 shadow 时，用替换节点的 `sourceEventSeqs` 重定位；找不到则标 `anchorLost`，该区间不再压缩。
- 区间从第一个非 system 节点起（0.2.3 的 `compactRegion` 拒绝含受保护 system 头的区间）；端点必须工具配对平衡。
- 生命周期：create 时若已有 open 根任务，先自动关闭它（end = 新任务 start 前一个 surface 节点）；rename 仅 open；complete/abandon 写 end；reopen 清空 end，且父任务必须 open；不做删除。
- 嵌套：`nesting.maxDepth` 默认 0（关闭），允许 0–5；子任务只能显式创建；父任务关闭前必须无 open 子任务；父 abandon 级联放弃子任务；id 按父链编号。
- fork：插件记录随日志复制；open 任务标 `inherited`，子会话首次加载写一条 `fork` 事件；默认继承并在 UI 提示。
- 压缩状态按节点派生：`none / partial / full`；父任务 partial 时能定位已折叠子段。

### D. 持久化

- 用 `appendPluginRecord(session, 'plugin:taskline/event', payload)` 写入；记录 log-only、不进 surface、占日志 seq、fork/resume 随日志带走。
- 该 API 在 DSH 内标为 experimental：只按实验 API 使用，锁定 DSH 版本范围，升级时跑兼容性套件。
- `plugin:taskline/event` 符合插件记录 grammar；payload 必须无损 JSON。

### E. 压缩引擎

- **不提供 `ctx.compaction`**。用官方 `ctx.agentPresets.serviceFor(agent, 'compaction')` 读取 agent 所在 preset 隔离组里的引擎；host 层的 `ctx.compaction` 在 web profile 是 undefined，不依赖它。
- 后端：`auto | native | bili`；解析顺序为 bili 可用且选中 → bili，否则 `serviceFor` 有值 → native，否则自禁用并在 UI 标“压缩不可用”。
- `compaction.enabled=false`：停止 taskline 驱动，环境原有压缩（native 自动 / bili wire）照常；不是全局关压缩。
- 触发：任务关闭后延迟 `tasksLater`（默认 2）个新任务；占用率超 `thresholdRatio`（默认 0.8）时按最旧→最新批量；手动 `/taskline compact`。
- 每 session 一条串行队列；引擎锁冲突退避重试；失败记录事件并保留区间待下次。
- **原生 `/compact` 不归 taskline 管**（它走 preset 内的服务，没有拦截点），列为已知限制。

### F. 裁边

- 位置分类：`blocked` = 落在 open 任务区间内且不在任何已关闭子任务区间内；`p=0` 永远 blocked；其余 `allowed`。
- `allowed` 切成极大连续段 → 转首尾 seq → 校正到工具配对平衡边界，校正失败则丢弃该段。
- 无可压段时返回“无可压段”并列出阻塞任务，不写压缩事件、不报错。
- 报告字段：`requested`、`kept`（含 token 估算）、`skipped`（原因 `open-task / system-head / pairing` + 任务 id）。
- 放行：`/taskline gate off` 仅人可用、session 级、下个 session 恢复；放行事件标记时间并在压缩事件里记录。

### G. bili 后端

- `dsh-taskline-bili` 以精确版本依赖携带 `billion-context@0.1.216`，重导出 `dsh-native` 与 `dsh-compaction-gate` 入口，并暴露 `bili:runtime`（origin、`conversationId = session.id` 映射、status）。adapter 注入它。
- 映射链：surface 位置 → 对应消息 id → snapshot 的 `rawId`（host-pinned 时等于宿主 message id）→ `ref`。`biliMsgIds` 是全有全无的 pin；pin 失败时明确报“映射不可用”，不猜。
- `compress` 参数是单个字符串，可包含多个 `mNNNNN–mNNNNN` 区间块；摘要由 taskline 生成并传入（`externalSummary` 默认关，此时摘要权威；开启时降级为 hint）。
- 被拒是 HTTP 200 + `outcome:"refused"`，不是 4xx；`protectedTools` 的 `ref:null` 逐字提交。
- 版本或 `protocolVersion` 不在 `SUPPORTED` 矩阵 → adapter 自禁用，`auto` 回退 native。
- 升级显式：改 pin + 更新兼容矩阵 + 跑套件；周级检查上游 tag，新 tag 开 issue 判断是否需要适配。

### H. UI

- dock：`conversation.input.dock`，位于 Timeline（order 20）下方；单行可折叠，展开显示当前任务、分段进度与图例；无任务时隐藏。
- 右栏：`ctx.sidebarRightTabs.register({ id, kind: 'taskline', priority: 'extension' })` + `sidebar.right.pane.tab`；任务与压缩事件在同一个 tab 正文内切换；不注册 `rightbar`（single slot）。
- 任务树：默认展开两层；嵌套缩进 + 深度徽标；`maxDepth=0` 时平铺；节点显示区间、token、压缩状态、完成/改名/重开动作。
- 工具卡：`tool.call.toolview`，key 为 `task_start` / `task_rename` / `task_complete` / `task_abandon` / `task_reopen` / `compress`。
- 裁边提示：渲染在 `compress` 工具卡内部（DSH 没有任意插条 slot）。
- 设置：从插件页进入，选中 `dsh-taskline` 打开详情里的配置页（`plugins.bundle.config`，key = 包名）；不使用已删除的 `settings.plugins.tab`。
- 数据通道：读 Session Projection（`ctx.sessionProjections.register` + `useProjection`），写 Remote RPC；agent 通知走 `session.prompt(..., running ? 'steer' : 'queue')`。
- 样式只使用 `--dsw-*` token（bg / border / label / brand / state / chart），不硬编码色值；radius 无 token，用 8/10px。

### I. 配置

| 键 | 默认 | 校验 |
|---|---|---|
| `autoCreate.enabled` | true | — |
| `autoCreate.thresholdCalls` | 3 | 1–20 整数 |
| `nesting.maxDepth` | 0 | 0–5 整数 |
| `compaction.enabled` | true | — |
| `compaction.backend` | `auto` | auto/native/bili |
| `compaction.thresholdRatio` | 0.8 | 0.1–1 |
| `compaction.tasksLater` | 2 | 1–10 整数 |
| `compaction.notifyOnClamp` | true | — |
| `reminder.enabled` | true | — |
| `reminder.thresholdTokens` | 50000 | 1000–1000000 整数 |
| `reminder.cooldownMinutes` | 10 | 1–1440 整数 |

- schemastery 声明 + `Volatile` 读取；越界返回可读错误，不静默夹紧。
- 写回 `configForms.mutate()`，namespace = profile entry id；写 profile 补丁并经 HMR 生效。
- `--dump-config` 打印 entry 树，不是配置值；任何文案不得声称“同源”。

### J. 兼容与升级

- 目标 DSH 0.2.3-alpha.2；`engines.dsh` 顶层 `>=0.2.2-0 <0.3.0`。
- bili 锁 `0.1.216`；适配矩阵按版本 + `protocolVersion` 判定。
- 每次 DSH 或 bili 升级：先跑 headless 验收，再人工 web 冒烟。

### K. 已知限制

- 原生 `/compact` 与 preset 内的自动压缩不受 taskline 裁边约束。
- bili 后端不写 DSH 会话日志；压缩状态来自 bili，不产生 compaction 事务。
- 插件记录 API 为 experimental，存在上游变动风险。
- 单 agent 范围；多 agent 并行任务区间不做。
- 不做旧会话批量补录/迁移。

## Testing Decisions

- **主 seam：进程级 headless**。隔离 `DSH_HOME` + `taskline-dev` profile，LLM 侧接 `@deepseek-ai/dsh-llm-mock-server` 脚本化 tool call；断言外部世界：会话 JSONL 的 `plugin:taskline/event` 顺序、`compaction/*` 事件、裁边报告、退出码。覆盖：任务生命周期、嵌套开/关、native 压缩、裁边跳过 open 任务、`compaction.enabled=false`、fork/resume 重建、卸载后会话可读。
- **辅 seam：纯函数单测**。锚解析/重定位、裁边切段、配置 schema 校验、压缩队列串行；bili adapter 用本地 mock HTTP 断言版本门禁与 `ref:null` 处理。
- 好测试只断言对外行为，不测内部数据结构；进程级断言读日志与文件，不做“模型自述”关键词探测。
- 先例：DSH 自带 `llm-mock-server` 与 snapshot/replay 车道；本仓库沿用“mock 外部、其余真实”的原则。
- 不做像素/浏览器自动化；web 只做人工冒烟清单（dock 折叠、任务树嵌套、压缩事件、插件详情配置、Timeline 并存不重影）。
- CI 跑单元 + headless；web 冒烟本地跑。

## Out of Scope

- 修改 DSH 核心或给 core 打补丁。
- fork / 修改 billion-context。
- 浏览器像素级视觉回归。
- v0.1 的对外发布与市场上架。
- 多 agent / 子会话的任务归属与并行区间。
- 旧会话的任务补录与迁移。
- i18n 与文案体系。
- 原生 `/compact` 的裁边或拦截。
- Timeline 的计划、汇报、进度编辑能力。

## Further Notes

- 决策记录：地图 [#2](https://github.com/hyperion2144/dsh-taskline/issues/2)；研究 `docs/research/01-core-runtime.md`、`02-session-compaction.md`、`03-ui-client.md`、`04-billion-context.md`；UI 原型 `docs/prototypes/ui-v0.1.html`。
- 本 spec 取代 [issue #1](https://github.com/hyperion2144/dsh-taskline/issues/1) 的 §2–§7；其中被推翻的接口假设以本 spec 为准。
- 实施遵循仓库纪律：整个地图一个 worktree / 分支 / 提交记录 / PR；PR 合入前 BUG 票不关闭。
