# 研究报告 02：issue #1 对 session / seq / surface / 压缩引擎的假设是否成立

> **版本基线**：DSH `master` @ commit `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`（tag `dsh-v0.2.3-alpha.2`，`package.json` version `0.2.3-alpha.2`，2026-11-22）。
> **本文件取代旧版**（旧版基于 0.2.2-alpha.3，结论多处已过时——见 §②2.9「0.2.3 相比 0.2.2 的变化」）。旧文档的结构可参考，但所有判定以本版为准。
> 研究对象：`hyperion2144/dsh-taskline` issue #1 的 §3.1、§4、§6、§7。
> 一手来源：DSH 源码 `/Users/mutou/vault/projects/deepseek-harness`（只读）；vendored cordis `vendor/cordis`、`vendor/loader`；DSH 自带文档 `docs/subsystems/*.md`、各包 `README.md`；npm registry 上已发布的 `0.2.3-alpha.2` tarball。
> 核查方式：源码逐条比对 + 发布产物核验（`npm pack`）+ cordis/loader 语义核读。**未修改任何 DSH 代码，未做任何 git 写操作。**

---

## ① 结论摘要表

| # | 核实项 | 结论 | 关键差异（相对 issue 描述） |
|---|---|---|---|
| 1 | 会话日志 / seq / surface 语义 | ✅ **成立**（但 issue 用词不准） | `SessionSeq` = 日志下标（`packages/core/session/src/types.ts:33`）。`SurfaceOp` 只有两种：`'append'` 与 `{ op:'replace', startSeq, endSeq }`（`types.ts:477-479`）。**replace 按 surface 位置定位，不是数字 seq 区间**（`docs/subsystems/session.md:339`）。 |
| 2 | 替换后 seq 是否非单调 | ❗ **会非单调，issue 必须改设计** | `applySurfacePlan` 用 `splice` 把新节点（更高 seq）插到被替换区间的**原位**（`packages/core/session/src/surface.ts:585`），其后的老节点 seq 保持不变 → surface 上出现 `seq 降序`。`CompactionResult.shadowedRange` 明确写「`start` 可以大于 `end`」（`packages/compaction/compaction/src/types.ts:110-113`；`docs/subsystems/compaction.md:62-64`）。**任务区间必须存「surface 位置 + seq 快照」两套坐标**。 |
| 3 | `shadowedRange` / `shadowedSeqs` / `sourceEventSeqs` 的重定位能力 | ✅ **三件套齐备，可做重定位** | `shadowedRange` = 首末被 shadow 节点的 seq 对（位置跨度）；`shadowedSeqs` = 全部被 shadow 节点 seq（**权威集合**）；`sourceEventSeqs` = replacement 节点引用的来源 seq 集合，**必须包含每一个 shadowed 节点**（`packages/core/session/src/surface.ts:370-373`）。压缩 replacement 写的是 `[startEvent.seq, summaryEvent.seq, ...shadowedSeqs]`（`packages/compaction/compaction-basic/src/region.ts:514`）→ 从新节点可反查全部原文 seq。 |
| 4 | 压缩事务 `compaction/start\|summary\|end`（+ `prune`） | ✅ **四个事件真实存在**，但**「三事件齐全或一个不写」是错的** | 四个事件全部真实（`packages/compaction/compaction/src/types.ts:24,34,72,82`）。都是 **log-only**，真正的 surface 变更是一次独立的 `user/message` replace（`region.ts:512-515`）。失败语义见 §②2.3。 |
| 5 | 锁与并发 | ✅ **持久锁真实存在** | 未配对的 `compaction/start` 就是锁；`session/end-seed` 之后的未配对 start 才算「活锁」，之前的算陈旧证据（`region.ts:309-321`、`docs/subsystems/compaction.md:21`）。**锁是时间点不是排他容器**：手动路径允许 start/end 之间插入无关上下文。 |
| 6 | `ctx.compaction` 三方法的真实签名与可见性 | ✅ **是公开 API，第三方可调用** | `CompactionEngine` 抽象类从 `@deepseek-ai/dsh-compaction` 根导出，三个抽象方法签名见 `packages/compaction/compaction/src/index.ts:136-193`；`ctx.compaction` 类型合并见 `:88-91`。`docs/subsystems/compaction.md:145-206` 有生成的 Cordis API 目录。**但 `BasicCompactionEngine.compactRegion` 的 `agent` 形参在实现里被窄化成 `Agent`**（`compaction-basic/src/index.ts:400-404`），issue §4.1 用 `CompactionAgentContext` 会类型不匹配。 |
| 7 | `BasicCompactionEngine` 导出与子类化钩子 | ✅ **可导出、可子类化，但只有 1 个钩子** | `export class BasicCompactionEngine extends CompactionEngine`（`compaction-basic/src/index.ts:119`），包根默认导出也是它（`:494`）。**唯一子类钩子是 `protected async summarize()`**（`:288-298`）。replay/事务/定价策略**不可覆写**（README 明写：「`summarize()` is the sole subclass customization hook」）。 |
| 8 | `compactSurfaceRegion` 的实际导出情况 | ❌ **仍不是公开 API（与 0.2.2 相同）** | 函数在 `packages/compaction/compaction-basic/src/region.ts:174` 且 `export`，但**包 `exports` map 没有 `./region` 子路径**（npm 实测：`@deepseek-ai/dsh-compaction-basic@0.2.3-alpha.2` 只导出 `.` / `./src/*` / `./package.json` / `./locale/*.json`）。发布 tarball 里**只有 `src/region.ts`（裸 TS 源码）和 `lib/types/region.d.ts`（类型），没有 `lib/types/region.js`（编译产物）** → `import { compactSurfaceRegion } from '@deepseek-ai/dsh-compaction-basic/region'` 直接 `ERR_PACKAGE_PATH_NOT_EXPORTED`。 |
| 9 | cordis entry id 的真实存在与语义 | ⚠️ **三个真实、一个不存在** | `compaction-basic`（`packages/bundle/base/cordis.patch.yml:366`）、`command-compact`（`:371`）、**`tool-result-pruner`**（`:446`；注意 entry id **不带** `compaction-` 前缀，npm 包名才叫 `@deepseek-ai/dsh-compaction-tool-result-pruner`）。**`bili-compaction-gate` 在 DSH 全仓库不存在**。 |
| 10 | `disabled` vs `config: { auto:false }` | ❌ **issue §2 的做法是错的** | `disabled: true` → loader **根本不挂载该插件**（`vendor/loader/lib/index.js:361-364`）→ `ctx.compaction` 不存在 → `command-compact`（`inject: ['commands','compaction']`）永远不激活 → **`/compact` 根本不注册**，且 DSH 的自动压力压缩一并消失。正确做法是 **`config: { auto: false }`**（`compaction-basic/src/index.ts:149`：只有 `auto` 为真才注册自动触发器），此时服务仍在、`compactNow` 可用、`/compact` 仍注册。 |
| 11 | `/compact` 的真实压缩范围 | ❌ **与 issue 相反** | `/compact` → `ctx.compaction.compactNow()` → `selectCompactableRange(session, measure, **0**)`（`compaction-basic/src/index.ts:436-441`）→ **压掉除受保护 system head 外的整个 surface**，不是「只压已标记可压的任务区间」。且要求 **agent 空闲**（`runMaintenance`），忙时报 "Compaction is unavailable"（`command-compact/src/index.ts:27-31`）。 |
| 12 | 阈值 / 保留比例 / 低水位 / 滞回 / summaryDepth | ⚠️ **部分成立** | 原生阈值 = `floor(min(W × 0.8, W − O − headroomTokens))`，`headroomTokens` 默认 **65536**（`compaction-basic/src/config.ts:20,75,191-194`）→ **不是简单的 0.8 × contextWindow**。保留尾 = `retainRatio` 默认 **0.16**（`:23,195-197`）。**没有低水位、没有滞回、没有 `summaryDepth`**——DSH 的行为恰恰相反（反复压到阈值以下；多层 checkpoint 会被后续压缩合并成一层，指令文本明确要求「Do not copy it forward verbatim」）。 |
| 13 | `ctx.tokenMeter` 取占用 | ✅ **可用，但要选对方法** | `ctx.tokenMeter.measure(session)` → `{ totalTokens, surfaceTokens, nodes[], baseline }`（`packages/llm/token-meter/src/index.ts:152-201`）。`ctx.tokenMeter.contextPressure(session)` → `{ pressureTokens?, contextWindow? }`（`:114-130`），**只读最近一次 provider 上报的 usage**，压缩后不立即反映（文档明示「These display values do not price a new request; use `measure()`」——`docs/subsystems/token-meter.md:58`）。**占用率 = `measure().totalTokens / contextWindow`**，其中 `contextWindow` 来自 `ctx.llm.resolveModelInfo(provider, model).context.contextWindow`，不是 `contextPressure()`。 |
| 14 | 插件记录与 surface seq 的关系 | ✅ **占 log seq，不进 surface** | `appendPluginRecord` 返回 `seq = SessionSeq(this.log.length)`，事件带 `ignorable: true`（`packages/core/session/src/index.ts:637-640`）；ignorable 事件不是 surface-eligible → `surfaceOpOf` 返回 `undefined`（`surface.ts:313-315`）→ **不进 surface**。后果：后续 surface 节点的**数字 seq 会平移，surface 位置不变**。issue §3.1 用 `startSeq/endSeq`（注明「surface seq」）表达任务区间 → **压缩后失效**。 |
| 15 | `history_read` / `history_search` | ❌ **仍不存在**，但**已存在等价的召回能力** | 全仓库无 `history_read`/`history_search`；提案笔记仍是 `Status: proposed`（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:52-56`）。实验包 `@deepseek-ai/dsh-tool-session-query`（entry id `tool-session-query`）注册 5 个模型工具：`session_search` / `session_event_search` / `session_trace` / `session_event_trace` / `session_event_read`（`packages/experimental/tool-session-query/src/index.ts:66-122`）。它按**原始日志**检索，事件被分类为 `current` / `shadowed` / `log-only`（`packages/session-query/session-query/src/documents.ts:59-82`）→ **被压缩的原文可按 seq 读回**。⚠️ 该包**在 0.2.2-alpha.3 就已存在**（`git merge-base --is-ancestor` 实测），不是 0.2.3 新增；0.2.3 对它的改动只有 1 行（`src/index.ts`）。 |
| 16 | `packages/experimental/timeline` 与压缩/任务的关系 | ⚠️ **与压缩无关，但与 issue 的 UI 抢同一个挂载点** | Timeline 是「任务树 + 定时进度报告」实验插件，`export const name = 'timeline'`（`packages/experimental/timeline/src/index.ts:19`），用 `plugin:timeline/tree` 等 plugin record 持久化（`src/storage.ts:446`），**完全不碰 compaction**（全包 `grep compaction` 无命中）。但它**注册在 `conversation.input.dock` 槽位，id `timeline`、order 20**（`src/client/index.ts:254-262`）——正是 issue §5.1 要求 taskline dock 挂载的同一槽位。 |

**总评**：issue 对**压缩事务模型**（`compaction/start` + `summary` + `end` + surface replace）的理解是**准确的**，说明作者读过 DSH 源码。但有 **6 个关键假设在 0.2.3 仍然站不住**：

1. **最致命**：把任务区间表达成数字 seq 区间（`startSeq`/`endSeq`）——第一次压缩后 surface seq 就非单调，区间判定即失效。必须改用 **surface 位置**。
2. **`compactSurfaceRegion` 不是公开 API**（0.2.3 未变），「re-export `BasicCompactionEngine` 就能落盘」这条路走不通；`BasicCompactionEngine` 只有一个可覆写钩子 `summarize()`。
3. **`disabled: true` ≠ 替代服务**：会让 `/compact` 直接消失。正确是 `config: { auto: false }`。
4. **`/compact` 语义相反**：压整个 surface，不压「已关闭任务区间」。
5. **cordis 同名服务不是「后注册的赢」，而是直接抛错**（§③4）。
6. **`history_read`/`history_search` 不存在**；可用的召回能力在 `tool-session-query` 的 5 个工具里（**0.2.2 起就有**，实验包）。

---

## ② 逐条核实

### 2.1 会话日志与 surface：seq 语义、`SurfaceOp`、非单调、重定位

#### (a) `SessionSeq` 的类型与含义

`packages/core/session/src/types.ts:33`：

```ts
export type SessionSeq = BrandedNumber<'SessionSeq'>
```

`SessionSeq(value)` 构造器要求「非负安全整数」（`types.ts:40-44`）。它是**会话日志的下标**：`#appendRecord` 用 `seq: SessionSeq(this.log.length)`（`packages/core/session/src/index.ts:637`），日志 seq 连续无空洞（`surface.ts:525-527` 强制 `event.seq === expectedSeq`）。

⚠️ 但 `docs/subsystems/session.md:11` 与 `packages/core/session/src/types.ts:517` 的措辞是「**Monotonic sequence number within the session**」——单调的是 **log seq**，不是 **surface 上的 seq 序列**。issue §3.1 注释里的「surface seq」正是混淆点。

#### (b) `SurfaceOp` 只有两种形态

`packages/core/session/src/types.ts:477-479`：

```ts
export type SurfaceOp =
  | 'append'
  | { op: 'replace'; startSeq: SessionSeq; endSeq: SessionSeq }
```

- `'append'`：加到 tail（普通 user/assistant/tool 消息）。
- `replace`：**替换 `startSeq`..`endSeq`（闭区间）之间的 surface 节点**，用本事件替换掉它们。两个端点必须**当前仍在 surface 上**（`surface.ts:427-434` 找不到就抛错），且 `startIdx <= endIdx`（按**位置**比较，`:435-437`）。
- `replace` 的对象必须**恰好 3 个键**（`surface.ts:299-308` 的 `isReplaceOp`），多一个键就报「carries an invalid replace surfaceOp」。
- `SurfaceIntent`（`types.ts:484-492`）：**只有 message-producing 事件**能带 `surfaceOp` / `sourceEventSeqs`；`assistant/message` **禁止**带 `sourceEventSeqs`（它内嵌 provider stream）；log-only 事件两者皆禁（`types.ts:530-534`，运行时由 `surface.ts:313-322` 强制）。

#### (c) surface 是什么、shadow 是什么

`surface.ts:609-624` 的 `foldSurface(events, projections)` 是**规范折叠**：把完整日志按序回放，得到

```ts
interface SurfaceFoldResult {
  nodes: SessionSeq[]            // 当前 surface 节点 seq，模型可见顺序
  replacements: SurfaceFoldReplacement[]
  projectedMessages: ReadonlyMap<SessionSeq, Message>
}
```

`SurfaceFoldReplacement`（`surface.ts:222-232`）记录每次替换：`seq`（替换者）、`start`/`end`（声明的闭区间端点）、**`shadowedSeqs`（实际被移除的 surface 节点，按 surface 顺序）**。

`shadowed` = 被 replace 从 surface 上移除、但**仍留在 append-only 日志里**的节点。日志是真相，surface 只是模型可见投影（`surface.ts:1-6`）。

#### (d) ❗ 替换后 seq 非单调 —— issue 必须改设计

`packages/core/session/src/surface.ts:585`：

```ts
state.nodes.splice(plan.startIdx, plan.endIdx - plan.startIdx + 1, plan.seq)
```

替换者 `plan.seq` 是**新分配的高 seq**，被插到**被替换区间的原位**。它后面的老节点（更小的 seq）留在原位不动 → **surface 上出现 seq 降序**。

举例：日志 append 到 seq 3/4/5 → surface `[3,4,5]`；对 seq 4 做一次 tool-result 内容重写 → 替换者 seq 20 落在 position 1 → surface `[3, 20, 5]`。此时 `3 < 20 > 5`，**非单调**。

官方文档两处显式承认：

- `packages/compaction/compaction/src/types.ts:108-113`：

  > A surface-POSITION span, not a numeric seq interval — after a prior replace lands a fresh high-seq summary node at an older range's position, `start` can be GREATER than `end`. `shadowedSeqs` is the authoritative set of shadowed nodes, in surface order.

- `docs/subsystems/session.md:339`：「Positions follow surface order, not numeric sequence order.」

**对 issue 的直接影响**：

- issue §3.1 `TaskRecord.startSeq/endSeq`（注释写「surface seq」）**不能用数字区间表达**。压缩一次后，跨压缩点的区间判定即失效。
- 必须改存 **surface 位置**（`session.surface.nodes` 的下标）+ **seq 快照**，判定时用位置。
- `task_complete` 的 `endAt < startSeq` 判定（issue §3.2）必须改成「endAt 的**位置** < startSeq 的**位置**」。
- `CompactionResult.shadowedRange.start > end` 是**合法状态**，UI / 断言不能假设 `start <= end`。

#### (e) `shadowedRange` / `shadowedSeqs` / `sourceEventSeqs` 的重定位能力

三件套可以拼出完整的「新节点 → 原文」重定位链：

| 字段 | 位置 | 语义 |
|---|---|---|
| `shadowedRange` | `compaction/src/types.ts:38,115` | `{ start, end }` = 被 shadow 区间**首、末节点的 seq**（位置跨度，非数字区间） |
| `shadowedSeqs` | `compaction/src/types.ts:39,117` | **全部**被 shadow 节点 seq，按 surface 顺序（权威集合） |
| `sourceEventSeqs` | `core/session/src/types.ts:488-491` | replacement 节点引用的来源 seq 集合；**必须包含每一个 shadowed 节点**，否则拒绝 |

强制点在 `packages/core/session/src/surface.ts:370-373`：

```ts
const missing = shadowedSeqs.filter(seq => !sources.has(seq))
if (missing.length > 0) {
  throw new Error(`surface replace: sourceEventSeqs must include every shadowed surface node; missing ${missing.join(', ')}`)
}
```

压缩 replacement 实际写的值（`packages/compaction/compaction-basic/src/region.ts:512-515`）：

```ts
session.append('user/message', checkpointMessage, {
  surfaceOp: { op: 'replace', startSeq: start, endSeq: end },
  sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...shadowedSeqs],
})
```

→ **从 replacement 节点的 `sourceEventSeqs` 可以直接读出全部被折叠原文的 seq**。这正是 issue §4.1 `recall?(session, seqs)` 想做的事的**基础设施**。

反向映射（被 shadow 的 seq → 谁替换了它）由 `foldSurface().replacements` 提供（`surface.ts:239`），以及 `tool-session-query` 的 `session_event_trace` 工具（见 §②8）。

#### (f) 受保护的首个 system 节点

`surface.ts:499-513`：`assertSystemHeadRewrite` —— 覆盖 surface node 0 且 node 0 是 `system/message` 时，replacement 必须**本身是 `system/message` 且只覆盖那一个节点**。

`compaction-basic/src/region.ts:351-353` 进一步在压缩侧兜底：

```ts
if (startIdx === 0 && systemHead(session, nodes[0]!) !== undefined) {
  throw new Error('compactRegion: the selected range includes the protected initial system message')
}
```

→ **任务区间绝不能包含 surface 的第 0 个节点**。

---

### 2.2 压缩事务：`compaction/start | summary | end`（还有 `prune`）

#### (a) 四个事件全部真实存在

`packages/compaction/compaction/src/types.ts`（全部通过 `declare module '@deepseek-ai/dsh-session/types'` 合并进 `SessionEventMap`）：

| 事件 | 行号 | payload |
|---|---|---|
| `compaction/start` | `:24` | `{ compactionId, sourceCommandId?, turn: number \| null }` |
| `compaction/summary` | `:34-67` | `{ compactionId, sourceCommandId?, summary: ContentBlock[], shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` **且**（联合类型）`{ rawOutput: ContentBlock[], llmStreamCall: true }` 或 `{ rawOutput?: ContentBlock[], llmStreamCall?: never }` |
| `compaction/end` | `:72` | `{ compactionId, sourceCommandId?, turn: number \| null, error?: string }` |
| `compaction/prune` | `:82-89` | `{ shadowedRange, shadowedSeqs, shadowedTokenCount }` |

`compaction/prune` **仍然存在**，它是 tool-result pruner 的**影子价格事件**，**不是**第四种事务形态：它没有 `compactionId`，也不参与 start/end 配对。`packages/compaction/compaction-tool-result-pruner/src/index.ts:160-178`：

```ts
session.append('compaction/prune', { shadowedRange: { start: seq, end: seq }, shadowedSeqs: [seq], shadowedTokenCount: this.ctx.tokenMeter.estimateMessage(original) })
const replacement = session.append('tool/result', { ...event.data, message }, {
  surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq },
  sourceEventSeqs: [seq],
})
```

⚠️ `docs/subsystems/compaction.md:11` 仍写「extends SessionEventMap with **three** event types」——**文档这里漏了 `compaction/prune`**（同文件 `:105-107` 又提到它）。以源码为准。

#### (b) 四个事件都是 log-only，真正的 surface 变更是独立的一次 replace

- `compaction/*` **不是** `SurfaceEventType`（`core/session/src/types.ts:451-459` 的 `SurfaceEventType` 只有 5 种 message-producing 类型），所以它们**不能**带 `surfaceOp`。
- 真正的 surface 变更 = 紧随 `compaction/summary` 之后的一次 `user/message` replace（`region.ts:497-515`），summary 内容被 `<compacted-summary>` 标签包裹（`compaction-basic/src/summarizer.ts:186-192`），其 message source 是 `compactCheckpointSource(compactionId, sourceCommandId?)`（`compaction/src/checkpoint.ts:32-40`）。

#### (c) 事务顺序与「相邻性」契约

`compaction/src/types.ts:28-32` 明确：

> The summary content is in `data.summary`; the actual surface replacement is performed by the immediately following `user/message` event that shadows the compacted range. **That adjacency is contractual** — the shadowed pricing fields are the replacement's shadow price, so a consumer may pair a replacement with the metering event directly before it.

即：**`compaction/summary` 必须与 replacement 紧邻**（`compaction/prune` 同理，`compaction/src/types.ts:79-80`：「The replacement MUST be appended synchronously right after this event」）。token-meter 的投影依赖这个相邻性（`packages/llm/token-meter/src/surface-projection.ts:68-74`、`breakdown-projection.ts:154-160`）。

#### (d) ❗ 失败时的补写语义 —— issue §6「三事件要么齐全要么一个不写」**是错的**

`packages/compaction/compaction-basic/src/region.ts:211-276` 是唯一的落地事务：

```
1. validateSurfaceRegion(start,end)            // 只读校验
2. inspectCompactionEntryState(session)        // 查锁
3. assertCompactionInactive(...)                // busy 则抛 ManualCompactionError('busy')
4. session.append('compaction/start', lifecycle)   // ← 锁在这里就位（同步，先于 await）
5. prepareCompaction → summarizeCompaction(await)   // 异步
6. assertStable(...)
7. commitCompactionBody: append('compaction/summary') + append('user/message', replace)
8. session.append('compaction/end', lifecycle)      // 恰好一次 close 尝试
```

失败路径（`:241-252`）：

```ts
} catch (error: unknown) {
  failure = { error, stage: closing ? 'commit' : stage }
  if (!closing) {
    closing = true
    try {
      session.append('compaction/end', { ...lifecycle, error: errorChain(error) })
      closed = true
    } catch (closeError: unknown) {
      failure = { error: closeError, stage: 'commit' }
    }
  }
}
```

所以真实语义是：

| 场景 | 落盘内容 |
|---|---|
| 成功 | `compaction/start` + `compaction/summary` + `user/message`(replace) + `compaction/end` |
| 摘要失败 / 区间变化 / 取消 | **`compaction/start` + `compaction/end`(带 `error`)**，`compaction/summary` 与 replacement **不写** |
| `compaction/end` 本身写失败 | 只剩 `compaction/start` → **孤儿锁**（可被检出） |
| `busy` 拒绝 / start 之前的取消 | **什么都不写**（`docs/subsystems/compaction.md:99`：「only failures after the `compaction/start` marker are recorded … while a `busy` rejection or pre-start cancellation leaves no record」） |

→ issue §6 的「三事件要么齐全要么一个不写」**必须改写**为「**start 一定写；成功时三事件齐全 + 一次 replace；失败时 start+end(error) 两件，summary 与 replace 不写；end 也失败则留孤儿 start**」。

另注：`compaction/end` 的 `error` 字段是 `errorChain(error)`（字符串链），不是 Error 对象。

#### (e) 锁与并发

- **锁 = 未配对的 `compaction/start`**。`region.ts:309-321` 的 `assertCompactionInactive`：若最新的 `compaction/start` 之后没有配对的 `compaction/end`，且它**在**最近的 `session/end-seed` **之后**（即属于当前进程生命周期），则抛 `ManualCompactionError('busy', ...)`；`session/end-seed` **之前**的孤儿 start 视为**陈旧证据**，忽略。
- 扫描逻辑在 `region.ts:572-605` 的 `inspectCompactionEntryState`：从 `session.seq - 1` **向前**扫，同时找 `openTurn` / `unmatchedCompactionStart` / `latestEndSeedSeq`。
- **锁是时间点不是排他容器**（`docs/subsystems/compaction.md:21`）：手动路径允许 start 与 end 之间插入无关上下文（idle inject），因此手动路径只重校验**自己选中的 span**（`region.ts:453-474` 的 `assertSelectedSpanStable`），而自动/显式区间路径要求**整个 surface** 不变（`region.ts:437-446` 的 `assertWholeSurfaceUnchanged`）。
- **自动路径要求有 open turn**：`owner: 'current-turn'` 时 `entryState.openTurn === null` 直接抛 `'compactRegion: no open turn — automatic compaction events must be enclosed in a turn'`（`region.ts:199-201`）。
- **手动路径要求没有 open turn**：`owner: null` 时若 `openTurn !== null` 抛 `ManualCompactionError('busy', 'manual compaction: the session already has an open turn')`（`region.ts:194-196`）。

→ **issue §6「并发 compress → 串行队列」的诉求，DSH 层已经有锁，但锁是「拒绝」而不是「排队」**：第二个并发请求拿到 `busy`，不会被排队。taskline 必须自己实现串行队列。

#### (f) 摘要失败的恢复钩子

`compaction/src/index.ts:106` 声明了 waterfall 事件：

```ts
'compaction/summary-error'(payload: { session, sourceEventSeqs, error, signal? }, next: () => boolean): boolean
```

语义（`docs/subsystems/compaction.md:261-279`）：监听器返回 `true` 表示**已经同步记录了一个持久化的输入变更**（用于恢复），后端会重新推导并重新计价输入再重试；返回 false / `next()` 则放弃重试。`packages/compaction/compaction-image-offload/src/index.ts:33` 是现成用例。

---

### 2.3 `ctx.compaction` 接口：真实签名、可见性、导出情况

#### (a) 抽象契约（公开 API）

`packages/compaction/compaction/src/index.ts:119-193`：

```ts
export abstract class CompactionEngine extends Service {
  constructor(ctx: Context) { super(ctx, 'compaction') }          // ← 服务名 'compaction'

  abstract compactIfNeeded(
    agent: CompactionAgentContext,
    trigger: CompactionTrigger,        // 'pressure' | 'context-overflow'
    signal: AbortSignal,
  ): Promise<CompactionResult | null>

  abstract compactNow(
    agent: ManualCompactAgentContext,
    signal: AbortSignal,
    sourceCommandId?: CommandId,
  ): Promise<CompactionResult | null>

  abstract compactRegion(
    start: SessionSeq,
    end: SessionSeq,
    agent: CompactionAgentContext,
    signal?: AbortSignal,
  ): Promise<CompactionResult>
}
```

类型合并（`:88-91`）：

```ts
declare module '@deepseek-ai/cordis' { interface Context { compaction: CompactionEngine } }
```

- `CompactionAgentContext`（`:67-70`）= `{ session: Session; options: { provider?: string; model?: string } }`。
- `ManualCompactAgentContext`（`:77-86`）= 上者 + `runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>`。
- `CompactionTrigger`（`:32`）= `'pressure' | 'context-overflow'`。
- `ManualCompactionError`（`:48-64`）code 闭集（`:35-41`）：`busy | cancelled | changed | summary | commit | persistence`。

**公开性判定：✅ 是公开 API。** 依据：

1. `CompactionEngine` 从包根导出（`packages/compaction/compaction/src/index.ts:16-23` 一系列 `export`），npm `@deepseek-ai/dsh-compaction` 的 `exports` 含 `.`（实测）。
2. DSH 官方生成的 Cordis API 目录把它列为公开服务面：`docs/subsystems/compaction.md:143-206`（`### ctx.compaction — CompactionEngine (abstract seam)`）。
3. `docs/subsystems/compaction.md:84`：「`compactNow()` runs as agent maintenance between turns … Implementations must forward the supplied signal to summarization.」并把 `ctx.tokenMeter` 定位为独立的测量服务。

**第三方调用方式**：插件 `inject: ['compaction']` 后即可 `ctx.compaction.compactRegion(...)`。DSH 内部的旁证：
- `packages/compaction/command-compact/src/index.ts:13` —— `inject = ['commands', 'compaction']`（人类消费者的标准写法）。
- `packages/extensions/tool-cordis/src/api-catalog.ts:708-730` —— `tool-cordis` 把 `ctx.compaction` 收进**模型可自省的服务目录**，并逐字收录了三个方法的签名与 JSDoc → 证明这是**面向第三方的公开服务面**，不是内部实现细节。
- `docs/subsystems/compaction.md:143-206` —— 官方生成的 Cordis API 目录里 `ctx.compaction` 被列为公开 seam。

⚠️ 反例：`packages/compaction/compaction-image-offload/src/index.ts:18-19` 的 `inject` 是 `['agents', 'sessions']`，它**不**注入 `compaction`，而是通过 `compaction/summary-error` waterfall（`compaction/src/index.ts:106`）参与压缩流程 —— 提醒：想介入压缩流程，**不一定非要拿到 `ctx.compaction` 这个服务**，事件钩子也是入口。

#### (b) `BasicCompactionEngine` 的导出与子类化钩子

`packages/compaction/compaction-basic/src/index.ts:119`：

```ts
export class BasicCompactionEngine extends CompactionEngine {
  static inject = ['llm', 'tokenMeter', 'sessions', 'sessionProjections']
  static Config: z<BasicCompactionConfig> = z.object({ thresholdRatio, headroomTokens, retainRatio, retainTokens, summarizationProvider, summarizationModel, maxTokens, compactionRetries, maxOverflowRetries, modelPolicies, auto })
```

包根同时 `export default BasicCompactionEngine`（`:494`）。`Config` 里**有 `auto`**（`:133`）。

**子类化钩子：只有 `summarize()`。**

`compaction-basic/src/index.ts:288-298`：

```ts
protected async summarize(
  input: SummarizationInput,
  agent: Agent,
  signal?: AbortSignal,
): Promise<SummaryResult>
```

官方 README 明确（`packages/compaction/compaction-basic/README.md`，"Design philosophy" 段）：

> **`summarize()` is the sole subclass customization hook.** A template- or remote-summarizer subclass can override it while pressure, retention, cited source events, shrink validation, and shadowed-token accounting stay on the token meter.

且类注释（`index.ts:111-118`）：「`summarize()` is the sole subclass customization hook; **the replay and durable mutation strategy stays fixed** so every pricing decision uses the singleton token meter.」

→ **issue §4.3「自有指令模板 + 拿到摘要后走 `compactSurfaceRegion` 落盘」在 0.2.3 不可直接实现**：

- 只覆写 `summarize()` → 摘要文本是你的，但**落盘事务仍是 DSH 的**（start/summary/end/replace 全部由 `compactSurfaceRegion` 完成）。这其实**正好**是 issue 想要的效果（"必须产生真实的 DSH compaction 事务"）✅，只是实现路径不是「自己调 `compactSurfaceRegion`」，而是「继承 `BasicCompactionEngine` 覆写 `summarize()`」。
- 想**完全自控**事务 → 必须自己写 `CompactionEngine` 子类并**自己实现**事务（因为 `compactSurfaceRegion` 不可 import，见 (d)）。代价是丢掉 DSH 的计价/配对/稳定性校验。

另外 `BasicCompactionEngine` 的 `agent` 形参被**窄化**为 `Agent`（`compaction-basic/src/index.ts:311, 402`），与抽象声明的 `CompactionAgentContext` **不一致**（TS 方法形参双变才没报错）。→ issue §4.1 的 `compact(session, start, end, agent: CompactionAgentContext, ...)` 若直接映射到 `ctx.compaction.compactRegion`，**类型不匹配**（`ctx.compaction` 声明类型是抽象类，形参是 `CompactionAgentContext`，所以经 `ctx.compaction` 调用是 OK 的；但若持有 `BasicCompactionEngine` 实例则不是）。

#### (c) `compactNow` 的真实语义（issue §4.0「手动 /compact 走同一条路」）

`compaction-basic/src/index.ts:425-477`：

```ts
override compactNow(agent, signal, sourceCommandId?): Promise<CompactionResult | null> {
  signal.throwIfAborted()
  try {
    return agent.runMaintenance(async (agentSignal) => {
      ...
      const range = selectCompactableRange(agent.session, this.ctx.tokenMeter.measure(agent.session), 0)   // ← retainTokens = 0
      if (range === null) return null
      return await compactSurfaceRegion(this.regionDependencies(), agent.session, range.start, range.end, agent,
        { owner: null, stability: 'selected-span', ...sourceCommandId === undefined ? {} : { sourceCommandId }, flush: async () => { await this.ctx.sessions.flush(agent.session) } },
        operationSignal)
    })
  } catch (error) { throw new ManualCompactionError('busy', 'manual compaction requires an idle agent with no waking queued work', { cause: error }) }
}
```

要点：

1. `retainTokens = 0` → `selectCompactableRange`（`region.ts:118-156`）从 tail 往前累加到 `>= 0` 立即 break → `keepFromIdx = last index` → 保留尾只有 1 个节点；再按 tool-call/result 配对往前扩 → **实际压掉除 system head 外的几乎整个 surface**。
2. `owner: null` → `turn: null` 的**独立**事务（不是自动路径的编号 turn）。
3. `stability: 'selected-span'` → 只要求选中的 span 不变（允许 idle inject 在 start/end 之间插内容）。
4. `flush` → 事务闭合后 `ctx.sessions.flush(session)` 落盘；失败抛 `ManualCompactionError('persistence')`。
5. 要求 **agent 空闲**：`agent.runMaintenance` 在 agent 忙时**同步抛** → 被包成 `'busy'`。

→ **issue §4.0「`/compact` 也走同一条路——压所有已标记可压缩的任务区间」与 DSH 实际完全相反**。DSH 的 `/compact` 没有「任务」概念，也没有「可压缩标记」概念。

#### (d) `compactSurfaceRegion` 的实际导出情况 —— ❌ 仍不可用

函数本体：`packages/compaction/compaction-basic/src/region.ts:174`：

```ts
export async function compactSurfaceRegion(
  dependencies: RegionDependencies, session: Session, start: SessionSeq, end: SessionSeq,
  agent: Agent, options: CompactionTransactionOptions, signal?: AbortSignal,
): Promise<CompactionResult>
```

同文件还导出 `selectCompactableRange`（`:118`）、`assertNoActiveCompaction`（`:328`）。但：

1. **`packages/compaction/compaction-basic/src/index.ts` 没有 re-export 它们**（index 只 re-export 了 config 相关类型，`:40-48`；`compactSurfaceRegion` 仅作为**内部 import** 使用，`:27-31`）。
2. **包 `exports` map 没有 `./region` 子路径**。npm registry 实测 `@deepseek-ai/dsh-compaction-basic@0.2.3-alpha.2`：

   ```json
   { ".": {...}, "./src/*": "./src/*", "./package.json": "./package.json", "./locale/*.json": "./locale/*.json" }
   ```

   → `import ... from '@deepseek-ai/dsh-compaction-basic/region'` → **`ERR_PACKAGE_PATH_NOT_EXPORTED`**。
3. **发布 tarball 里没有编译产物**。`npm pack @deepseek-ai/dsh-compaction-basic@0.2.3-alpha.2` 实测内容：

   ```
   package/src/region.ts              ← 裸 TS 源码
   package/lib/types/region.d.ts      ← 只有类型声明
   package/lib/types/region.js.map    ← 只有 sourcemap
   （没有 package/lib/types/region.js）
   ```

   （对比 `package/lib/index.js` **存在**，因为 `files` 显式列了 `lib/index.js`。）

→ **结论（与 0.2.2 一致，未改善）**：`compactSurfaceRegion` **不是第三方可用 API**。唯一可行的「用自己的事务」路线是 **写自己的 `CompactionEngine` 子类**，把 `region.ts` 的事务逻辑抄一份（或用 `CompactionEngine` 抽象 + 自己实现）。

> 附：`./src/*` 这个导出路径技术上让 `@deepseek-ai/dsh-compaction-basic/src/region.ts` 可解析，但那是**裸 TypeScript**，需要 Node 的 type-stripping，且它的传递依赖（`@deepseek-ai/dsh-brand` / `dsh-session` / `dsh-agent` / `dsh-llm` / `dsh-token-meter` / `dsh-commands/types` / `dsh-util-values`）全部是 `compaction-basic` 的 **peerDependencies**（npm 实测：`"@deepseek-ai/dsh-llm": "0.2.3-alpha.2"` 等精确版本），第三方插件必须自己装齐。**不推荐**，见 §④。

---

### 2.4 cordis 条目：`compaction-basic` / `command-compact` / `tool-result-pruner` / `bili-compaction-gate`

#### (a) 真实存在的 entry id

| issue 写的 | 真实 entry id | 证据 | npm 包名 |
|---|---|---|---|
| `compaction-basic` | ✅ `compaction-basic` | `packages/bundle/base/cordis.patch.yml:366-367` | `@deepseek-ai/dsh-compaction-basic` |
| `command-compact` | ✅ `command-compact` | `packages/bundle/base/cordis.patch.yml:371-372`；且 `command-compact/src/index.ts:12` `export const name = 'command-compact'` | `@deepseek-ai/dsh-command-compact` |
| `tool-result-pruner` | ✅ `tool-result-pruner` | `packages/bundle/base/cordis.patch.yml:446-447` | `@deepseek-ai/dsh-compaction-tool-result-pruner` |
| `bili-compaction-gate` | ❌ **不存在** | 全仓库 `grep` 无命中 | — |

⚠️ **entry id 与 npm 包名不一致**：`tool-result-pruner` 的 entry id **不带** `compaction-` 前缀（包名才带）。issue §2 的组合包 `cordis.patch.yml` 若写 `- id: compaction-tool-result-pruner` 会命中不存在的行。

其它相关 entry id（web-app bundle）：`compaction-image-offload`（`packages/compaction/compaction-image-offload/src/index.ts:18` `export const name = 'compaction-image-offload'`），bundle 里 id 是 `image-offload`（`packages/bundle/base/cordis.patch.yml:455-456`）——**同样 id ≠ 包名**。

#### (b) `disabled` vs `config: { auto: false }`

**`disabled: true`（entry 级）**：

- loader 的 `Entry.refresh()` 第一行就是 `if (this.disabled) return;`（`vendor/loader/lib/index.js:361-364`）→ **插件的 `apply()` 永远不被调用**，服务不存在。
- `Entry.disabled` 的判定（`vendor/loader/lib/index.js:336-346`）：entry 自身或**任一祖先 entry** 的 `disabled` 为真即算禁用；`disabled` 可以是 `!!js` 表达式。
- 于是 `ctx.compaction` **不存在** → `command-compact` 的 `inject = ['commands', 'compaction']`（`command-compact/src/index.ts:13`）永远无法满足 → cordis fiber 停在 INACTIVE（`vendor/cordis/src/fiber.ts:639-646` 的 `_refresh`：任一 inject 目标缺失 → `epoch = INACTIVE`）→ **`apply()` 不执行 → `/compact` 命令不注册**。
- 同时 DSH 的**自动压力压缩、模型切换压缩、溢出恢复全部消失**。

**`config: { auto: false }`（插件配置级）**：

- `compaction-basic/src/index.ts:149`：`if (this.config.auto) this._registerAutomaticCompaction()`。
- `auto: false` → **不注册** `agent/pre-step` 压力监听、`agent/request` 模型切换监听、`agent/request-error` 溢出恢复监听（`:162-273`）。
- 但 **服务本体照常存在**：`ctx.compaction` 可用，`compactNow` / `compactRegion` / `compactIfNeeded` 都可被显式调用 → **`/compact` 仍注册、仍可用**。
- 官方 README 表格（`packages/compaction/compaction-basic/README.md`，"Tuning when condensation starts" 表）：`auto` 默认 `true`，「Enable automatic condensation and overflow recovery; set `false` for **manual-only operation**」。

**→ issue §2 的组合包写法 `- id: compaction-basic` + `disabled: true` 是错的。** 正确写法是保留 entry、不 disable，或 `config: { auto: false }`。

⚠️ **但还有一层：web-app bundle 已经在 host 层 disable 了 compaction-basic**（`packages/bundle/web-app/cordis.patch.yml:613-621`）：

```yaml
# The token METER stays on the host plane; only the compaction backend that
# reads it moves. ...
- id: compaction-basic
  disabled: true
- id: command-compact
  disabled: true
- id: tool-result-pruner
  disabled: true
```

然后在 **preset 的 cordis group** 里按 isolation 重新挂载（`packages/bundle/web-app/presets/cordis.patch.yml:68-85`）：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 }
```

`isolate: { compaction: true }` 走 `vendor/loader/src/config/isolate.ts:79-88`：`label === true` → 该 entry 用 **LocalRealm**（按 entry id 隔离）→ **preset 组内的 `compaction` 服务实例与 host 层的不是同一个**。

→ **对 taskline 的直接影响**：host 层（group 外）的 `ctx.compaction` 是 **undefined**；只有进入 preset 的 `compaction` group 才能拿到服务。taskline 若在 host 平面提供自己的 `ctx.compaction`，会与 preset 组内的实例**并存但不冲突**（不同 realm）；而 `command-compact` 绑定的是 **preset 组内**的实例（它的 `inject` 解析在组内 realm 完成）→ **taskline 的引擎不会被 `/compact` 调用**。这是 issue §2/§4.2 没有考虑的一层。

#### (c) 「后注册的赢」—— ❌ **同名 provide 直接抛错**

`vendor/cordis/src/reflect.ts:326-330`：

```ts
const impl: Impl = { uid: ++this._implCounter, name, value, ctx: this.ctx, check, isolate: key, dependents: new Set() }
if (this.store[key]) {
  throw new Error(`service "${name}" has been registered at <${this.store[key].ctx.fiber.name}>`)
}
```

`Service` 基类就走这条路（`vendor/cordis/src/service.ts:60`：`self.ctx.reflect.provide(name, self, this[symbols.check])`）。

→ **同一个 context 里不能有两个 `taskline:compactor`**。issue §4.2 的「**后注册的赢**：如果同时装了 `compactor` 和 `compactor-bili`，bili 的覆盖默认的」**不属实**：`ctx.provide('taskline:compactor', biliCompactor)` 会在第二个插件 `apply()` 时**抛异常**，导致该插件加载失败。

正确做法（与 DSH 自己的做法一致）：**用不同的服务名 + 一个"当前生效者"的注册表**；或者让 bili 插件**替换** taskline-compactor 插件的 entry（`disabled` 切换）；或者用一个 `taskline:compactors` 列表服务 + 一个 `taskline:compactor-active` 选择服务。

#### (d) `bili-compaction-gate`

DSH 全仓库**不存在**这个 entry id。它属于 **billion-context** 侧（`~/.dsh/node_modules/billion-context`），不是 DSH 核心。taskline 若要引用它，得自己确认那个插件的 cordis entry 名与语义。

---

### 2.5 `/compact` 的真实压缩范围、阈值、低水位、summaryDepth

#### (a) `/compact` 的范围

`packages/compaction/command-compact/src/index.ts:60-80`：

```ts
const result = await ctx.compaction.compactNow(invocation.agent, invocation.signal, invocation.commandId)
if (result === null) return { kind: 'success', text: 'No compactable history yet.' }
return { kind: 'success', text: `Compacted ${result.shadowedSeqs.length} history items (~${result.shadowedTokenCount} tokens).`, sourceEventSeq: result.summarySeq }
```

→ 范围由 `compactNow` 决定（见 §2.3(c)）：`retainTokens = 0` → **除受保护 system head 外几乎整个 surface**。

外加三条硬约束：

1. **必须 agent 空闲**（`runMaintenance`），否则 `ManualCompactionError('busy')` → 文案「Compaction is unavailable because this process has an active compaction, or the agent is not idle.」（`command-compact/src/index.ts:27-31`）。
2. **不能带参数**：`/compact foo` → `USAGE` 错误（`:64-66`）。
3. **失败会被分类成人话**（`:24-57`）：`busy` / `cancelled` / `changed` / `summary` / `commit` / `persistence` 六种，各有固定文案。

→ **issue §4.0「手动：`/compact` 也走同一条路——压所有已标记可压缩的任务区间」是错的**。DSH 的 `/compact` 没有任务概念、没有「可压缩标记」。taskline 若要「`/compact` 只压已关闭任务」，**必须自己注册 `/compact` 命令**（`ctx.commands.register`），覆盖/替代 DSH 的 `command-compact`——而同一 context 里 `commands.register` 同名会怎样，需要实测（见 §④）。

#### (b) 阈值

`packages/compaction/compaction-basic/src/config.ts`：

- `DEFAULT_THRESHOLD_RATIO = 0.8`（`:20`）
- `DEFAULT_RETAIN_RATIO = 0.16`（`:23`）
- `headroomTokens` 默认 `65_536`（`:75`），`maxTokens` 默认跟 headroom（`:76`）
- `compactionRetries` 默认 `1`（`:105`），`maxOverflowRetries` 默认 `1`（`:106`）

真正的阈值计算在 `resolveCompactSpec`（`:153-217`）：

```ts
const messageBudgetTokens = contextWindow - reservedCompletionTokens
const pressureBudgetTokens = messageBudgetTokens - policy.headroomTokens
const thresholdTokens = Math.floor(Math.min(contextWindow * policy.thresholdRatio, pressureBudgetTokens))
const retainTokens = policy.retainTokens === undefined
  ? Math.floor(messageBudgetTokens * policy.retainRatio)
  : policy.retainTokens
if (retainTokens >= thresholdTokens) throw new TargetPressureConfigError(...)
```

其中 `reservedCompletionTokens = header.config.maxTokens ?? adapterInfo.defaultMaxTokens ?? 0`（`compaction-basic/src/index.ts:68-70`），`contextWindow` 来自 `ctx.llm.resolveModelInfo(provider, model).context.contextWindow`（`:345`）。

官方 README 的表述（`packages/compaction/compaction-basic/README.md`）：

> With context window `W`, effective request output cap `O`, and headroom `B`, the default trigger is `floor(min(W × 0.8, W − O − B))`, where `B = 65,536` tokens. Retention keeps the newest 16% of `W − O` verbatim.

→ **issue §7「80/60 滞回」与 §5.5「低水位 60%」在 DSH 里都没有对应物**：

- DSH 的触发线是 `min(W × 0.8, W − O − B)`，**不是** `0.8 × W`（当 `O + B` 不小的时候更激进）。
- **没有低水位**：DSH 的循环（`compaction-basic/src/index.ts:370-383`）是「压一次 → 重新测量 → 仍高于阈值就再压（最多 `compactionRetries + 1` 次）」，目标是**降到阈值以下**，不是降到某个更低的水位。
- **没有滞回**：没有「压到 X 以下后要涨回 Y 才再压」的双阈值。
- **没有 `summaryDepth`**：DSH 无此配置项，且行为相反 —— 摘要节点本身是普通 surface 节点，会被后续压缩**重新摘要**；摘要指令明确要求「If the conversation already contains a `<compacted-summary>` block, it is a PRIOR checkpoint. **Do not copy it forward verbatim**: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.」（`compaction-basic/src/summarizer.ts:69`）→ **多层 checkpoint 被合并成一层**，天然就是「深度 1」。

→ issue §3.6 的 `summaryDepth: 2` 与 §7 的「summaryDepth」测试项，**在 DSH 侧没有对应机制**，必须由 taskline 自己在**摘要文本层**实现（例如让每次摘要只针对「本任务区间」而非「整条 surface」）。

#### (c) `retainRatio` / `retainTokens` 的真实语义

- `retainRatio`（默认 0.16）与 `retainTokens` **互斥**（`config.ts:292-294`），同时给会报错。
- `retainRatio >= thresholdRatio` 在加载期就拒绝（`config.ts:235-239`）。
- 解析后的 `retainTokens >= thresholdTokens` 在运行时拒绝（`config.ts:198-204`）。
- `retainRatio` 的基数是 **`messageBudgetTokens`（= W − O）**，不是 W（`config.ts:195-197`）。

---

### 2.6 `ctx.tokenMeter`：怎么拿当前上下文占用

`packages/llm/token-meter/src/index.ts`：

| 方法 | 行号 | 返回 | 用途 |
|---|---|---|---|
| `measure(session, requestHeader?)` | `:152-201` | `TokenMeasurement`：`{ logRevision, baseline, surfaceDeltaTokens, totalTokens, surfaceTokens, nodes[] }` | **请求定价用**；`totalTokens` = 请求+响应压力；`surfaceTokens` = surface 路由定价总和 = Σ 节点价 |
| `contextPressure(session)` | `:114-130` | `{ pressureTokens?, contextWindow? }` | **展示用**；`pressureTokens` = 最近一次 provider 上报的 prompt 大小（不含输出）；压缩后**不立即反映** |
| `estimateMessage(message)` | `:220-225` | `number` | 单条消息启发式定价 |

`TokenMeasurement` / `TokenSurfaceNode` 类型：`packages/llm/token-meter/src/types.ts:23-55`（每个节点有 `tokens` 路由价 与 `heuristicTokens` 固定启发式价）。

**官方对 `contextPressure` 的定性**（`docs/subsystems/token-meter.md:58`）：

> `ctx.tokenMeter.contextPressure(session)` synchronously reads the latest logged `pressureTokens` and `contextWindow`; … **These display values do not price a new request; use `measure()` for request pricing.**

以及 `packages/llm/token-meter/src/projection.ts` 里 `ContextPressureProjection` 的注释：

> The fields, when present, are deliberately NOT one atomic request observation … This is an intentional trade — the value is a user-facing reference, **not a billing or gating input**.

**→ 占用率应当这样算**：

```
占用率 = ctx.tokenMeter.measure(session).totalTokens / contextWindow
contextWindow = (await ctx.llm.resolveModelInfo(provider, model, signal)).context.contextWindow
```

**DSH 原生压缩怎么用**（`compaction-basic/src/index.ts:334-389` 的 `compactPressure`）：

1. `header = agent.session.requestHeader()`；`target = header.config`（provider/model）。
2. `policy = resolveTargetPolicy(this.config, target)`（可被 `modelPolicies` 覆盖）。
3. `measurement = this.ctx.tokenMeter.measure(agent.session, header)` —— **用真实 header 定价**。
4. `info = await this.ctx.llm.resolveModelInfo(target.provider, target.model, signal)` → `info.context.contextWindow`（没有就抛 `TargetPressureConfigError`）。
5. `spec = resolveCompactSpec(policy, info.context.contextWindow, reservedCompletionTokens(header, info.defaultMaxTokens))`。
6. `if (measurement.totalTokens < spec.thresholdTokens) return null` —— **不触发**。
7. 触发后先跑 pruner（`ctx.get('toolResultPruner')?.pruneSession(session)`），**再重新测量**；仍超标才进摘要循环。
8. 摘要循环：`selectCompactableRange(session, measurement, spec.retainTokens)` → `compactRegion(range.start, range.end, agent, signal)` → 重新测量 → 低于阈值则返回；否则再来一次（上限 `compactionRetries + 1`）。

**→ issue §3.6 的 `reminder.thresholdTokens = 50000` 与 `autoCompact.maxPercent = 80`** 是 taskline 自己的策略，与 DSH 无关；但要注意 DSH 的占用率**不是**简单的 `totalTokens / contextWindow`，而是 `min(W×0.8, W−O−B)`，且 `O`（输出预留）通常不小（默认 maxTokens 常常等于 headroom 65536）。若 taskline 用 `0.8 × W` 做触发线，会比 DSH 更晚触发。

---

### 2.7 插件记录与 surface seq 的关系

#### (a) 机制存在，第三方可用

`packages/core/session/src/index.ts:247-252`：

```ts
export function appendPluginRecord<K extends Extract<keyof PluginRecordMap, PluginRecordType>>(
  session: Session, type: K, data: NoInfer<PluginRecordMap[K]>,
): SessionSeq
```

- 返回**已提交记录的 seq**。
- `PluginRecordType = \`plugin:${string}\``（`core/session/src/types.ts:544`）；`plugin:` 后跟斜杠分隔的小写字母/数字/`._-` 段，每段以字母或数字开头（`types.ts:538-543` 注释）。→ **`plugin:taskline/tree` 合法** ✅
- `PluginRecordMap` 是**可合并的全局接口**：第三方在自己的包里 `declare module '@deepseek-ai/dsh-session/types' { interface PluginRecordMap { 'plugin:taskline/tree': {...} } }` 即可。范例：`packages/experimental/timeline/src/records.ts:254-266`。
- 读回：`pluginRecordOf(event)`（`index.ts:266-270`）。

#### (b) 占 log seq，但**不进 surface**

`packages/core/session/src/index.ts:628-643`：

```ts
#appendRecord(type: PluginRecordType, data: unknown): SessionSeq {
  ...
  const record: unknown = deepFreeze({ type, seq: SessionSeq(this.log.length), time: Date.now(), data: dataSnapshot, ignorable: true })
  assertPluginRecordEvent(record)
  this.commit(record, entry)
  return record.seq
}
```

`ignorable: true` + 非 surface-eligible 类型 → `surfaceOpOf`（`packages/core/session/src/surface.ts:311-322`）走这条分支：

```ts
if (!isSurfaceEligibleType(event.type)) {
  if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable === true) return   // ← undefined = 不进 surface
  ...
}
```

→ 插件记录**占一个 log seq**，**不进入 `surface.nodes`**。

**后果（issue 必须知道）**：

- 后续 surface 节点的**数字 seq 会平移**（因为 log 长度 +1），但**surface 位置不变**。
- 所以「用 seq 记任务区间」在插件记录写入后**仍然正确**（seq 是绝对 log 位置，不会变），但**压缩后**会失效（surface 位置被替换、节点被 shadow）。**两者要分开存。**
- `selectCompactableRange` 会断言 `session.surface.nodes` 与 `measurement.nodes[].seq` 逐项相等（`compaction-basic/src/region.ts:126-130`）→ 说明 **surface 与 token-meter 的节点集合是严格 1:1 的**（插件记录不在其中）。

#### (c) DSH 仓库的政策限制（对外部插件不构成约束，但要知情）

`packages/core/session/src/index.ts:230-246` 的 JSDoc：

> Only production source under `packages/experimental/` may call this function; the `verify-plugin-record-callers` gate rejects any other production caller **in this repository**.

→ 这是 **DSH 仓库内部**的 lint gate，**不约束第三方插件**。但它透露出官方取向：**plugin record 是实验性插件的持久化手段**，核心能力不走这条路。

---

### 2.8 `history_read` / `history_search` 与召回机制

#### (a) `history_read` / `history_search` **仍不存在**

全仓库 `grep 'history_read|history_search'` → **0 命中**（`packages/`、`apps/`）。

对应的**提案笔记**仍在 proposed 状态（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md`）：

- `:52-56`：「A new package `@deepseek-ai/dsh-tool-recall` (consumer-only …) registers two model-facing tools: `history_read(checkpoint, offset?)` … `history_search(query, checkpoint?, limit?)`」。
- 该笔记同时提出「frozen index checkpoints」「state checkpoint」「pass execution（chunked、并发摘要、左到右提交）」等一整套设计。

→ **issue §4.1 的 `recall?(session, seqs)` 注释「配合 history_read / history_search 工具使用」引用的是尚未实现的工具。**

#### (b) 已存在的等价召回能力：`tool-session-query`（实验包，0.2.2 起就有）

`packages/experimental/tool-session-query/src/index.ts:16-19`：

```ts
export const name = 'tool-session-query'
export const inject = ['tools', 'systemPrompt', 'sessionQuery', 'agents']
```

注册 **5 个模型可见工具**（`:66-122`）：

| 工具 | 行号 | 能力 |
|---|---|---|
| `session_search` | `:67` | 在工作区历史会话里做全文检索 |
| `session_event_search` | `:77` | 在**单个**授权会话内检索早期事件 |
| `session_trace` | `:87` | 读会话谱系（祖先/后代关系） |
| `session_event_trace` | `:97` | 读**某个事件的直接替换与关系**（→ 「谁替换了我」） |
| `session_event_read` | `:110` | 读**一个完整未删减的事件**（→ 「把 shadowed 原文读回来」） |

**关键机制：事件被三分类**（`packages/session-query/session-query/src/documents.ts:59-82`）：

```ts
function classifySurface(events) {
  const folded = foldSurface(events, currentSessionMessageProjections)
  const result = new Map()
  for (const seq of folded.nodes) result.set(seq, 'current')
  for (const replacement of folded.replacements) {
    for (const seq of replacement.shadowedSeqs) result.set(seq, 'shadowed')
  }
  return result
}
```

→ **`current` | `shadowed` | `log-only`**（类型定义 `packages/session-query/session-query/src/types.ts:38-39`）。检索结果里带 `surface` 字段，过滤器支持按它筛（`types.ts:235`）。

**→ 被压缩掉的原文，在 0.2.3 里是可以被模型按 seq 读回来的**（`session_event_read`），并且 `session_event_trace` 给出 `replacedBy` / `replacementChain` / `replacedEventSeqs`（`types.ts:128-136`）——**这正是 issue §4.1 `recall()` 想要的重定位能力**。

⚠️ 三点限制：

1. `tool-session-query` 是 **experimental** 包（`packages/experimental/`），**默认不装**。
2. 它需要 `ctx.sessionQuery`（`@deepseek-ai/dsh-session-query`）与 `agents` 服务；且**有工作区授权语义**（`workspace-authorized`，`index.ts:2`）。
3. 它的 `session_event_search` 描述明说「**the current session excludes the step performing this call**」（`index.ts:78`）。

→ **issue 的 `recall?()` 应该改成基于 DSH 原语的实现**，而不是依赖不存在的 `history_read`：

```
recall(session, seqs):
  1. 用 session.eventAt(seq) 取原始事件（原始内容在 append-only 日志里，压缩不删）
  2. 或直接调 ctx.sessionQuery 的 event read（如果挂了 tool-session-query）
```

第 1 步只需要 `session.eventAt(seq)`，**不需要任何新工具**。

---

### 2.9 0.2.3 相比 0.2.2 在 compaction / session 上的变化（只列影响 issue 的）

对比 `git diff dsh-v0.2.2-alpha.3..HEAD -- packages/compaction/ packages/core/session/`：

#### (a) 压缩侧

| 变化 | 证据 | 对 issue 的影响 |
|---|---|---|
| **摘要路由改为「最后回答的模型优先」** | 新增 `packages/compaction/compaction-basic/src/answered-route.ts`（27 行）；`index.ts:143-148` 在构造时注册 `answeredRouteProjectionDefinition`；`summarizer.ts:126-135` 的 `summarizeWithLlm` 新增 `conversation` 形参 | ⚠️ 如果 taskline 自建摘要器并**不带** `summarizationProvider/Model`，现在必须自己决定路由（否则跟 DSH 行为不一致）。另外 `BasicCompactionEngine.static inject` 新增 `'sessionProjections'`（`index.ts:120`）。 |
| **`compactRegion` 新增「不得包含受保护 system head」校验** | `region.ts:349-353`（新增 5 行） | ⚠️ **直接命中 taskline**：任务区间如果覆盖到 surface 第 0 个节点会被拒。issue 必须显式排除它。 |
| **`compactRegion` 的 JSDoc 新增「initial system node 在选区之外」的明文约束** | `compaction/src/index.ts:169-170`（0.2.3 新增两行） | 与 (a) 的运行时校验配套：这条约束现在是**契约**而非实现细节。 |
| **`CommandId` 导入路径迁移** | `compaction/src/types.ts:11`、`src/index.ts:12`、`src/checkpoint.ts:9`：`@deepseek-ai/dsh-commands/brand` → `@deepseek-ai/dsh-commands/types`；`region.ts:13,206` 改用 `brandString<CompactionId>()` | ⚠️ **第三方若从 `@deepseek-ai/dsh-commands/brand` 导入 `CommandId`，在 0.2.3 会断**（该子路径已退役，见提交 `5e7206f6c6 refactor(exports): retire obsolete subpaths with compatible brand APIs`）。taskline 的 `package.json` 若 pin `<0.2.3` 的 peer 版本，要一并升。 |
| **`LlmError.fromFailure`** 取代手写构造 | `summarizer.ts:199` | 无影响。 |
| **`compaction-image-offload` 包** | `packages/compaction/compaction-image-offload/` | ⚠️ 该包**在 0.2.2-alpha.3 已存在**，0.2.3 只是改了投影接线。它是 `compaction/summary-error` 的现成消费方（`compaction/src/index.ts:106`），可作为 taskline「摘要失败后改写输入」的范例。 |

#### (b) session 侧

| 变化 | 证据 | 对 issue 的影响 |
|---|---|---|
| **`SurfaceManager.prepareBatch(events)` 新增** | `core/session/src/surface.ts:668-701` | 批量 append 可以**一次性原子校验**。⚠️ **但 batch 里含 replace 时走隔离 fold**（`:682-695`）——如果 taskline 想「一次提交多个任务记录 + 一次压缩」，这条 API 值得研究。 |
| **`SessionSurface.systemNodes` 新增** | `core/session/src/types.ts`（`surface.ts:244-249, 256`） | UI 判断「哪些 system 节点还在」用得上。 |
| **`SessionEventInput` 类型新增** | `core/session/src/types.ts:495-497` | 类型化的 append 入参。 |
| **surface 内部读事件改为 `read(seq)` 回调**（不再依赖 `events[]` 数组） | `surface.ts:528-532, 376-403, 464-492` | 内部重构，对外行为不变。 |
| **`session/src/validation.ts` 新增（570 行）** + `index.ts` 大幅瘦身 | `git diff --stat` | `Session` 的 append 校验被拆出。**对第三方插件影响：append 失败时的错误信息文本可能变化**，需实测。 |
| **plugin record 的 `commitPluginRecord` 改为静态字段** | `core/session/src/index.ts:619` | API 不变。 |

#### (c) 0.2.3 真正新增 / 值得注意的能力

| 能力 | 位置 | 影响 |
|---|---|---|
| **`tool-session-list`（新包：列 workspace / session 元数据）** | `packages/session-query/tool-session-list/` | 与压缩召回无关，但它是 0.2.3 真正**新增**的 session 工具包（entry id `tool-session-list`，`src/index.ts:11`）。 |
| **`session-query` 服务与 `shadowed` 分类** | `packages/session-query/session-query/` | ⚠️ **0.2.2-alpha.3 已有**（`git show dsh-v0.2.2-alpha.3:.../documents.ts` 已含 `shadowed`），0.2.3 只是重构（`observation.ts` / `list-metadata.ts` 等）。 |
| **`session_event_trace` 的 `replacedBy` / `replacementChain`** | `packages/session-query/session-query/src/types.ts:128-136` | ✅ 重定位链（同样 0.2.2 起就有）。 |
| **`packages/experimental/timeline`** | `packages/experimental/timeline/` | ⚠️ **与 issue §5.1 的 dock 挂载点冲突**（见下）。 |
| **会话正文里已有「压缩节点」渲染** | `packages/client/ui-chat/src/client/conversation-nodes/compaction.ts:41-85`（`compactionDefinition`，kind `compaction`） | ⚠️ **直接命中 issue §5.2/§5.3**：DSH 的 chat UI **已经把 `compaction/start|summary|end` + checkpoint 消息渲染成一条会话节点**（0.2.2-alpha.3 就有，0.2.3 改了 29 行）。taskline 若要另做一套「压缩事件」呈现，需说明差异化；不过 DSH 的这版是**正文内节点**，**不是侧栏 tab**，issue §5.2 的侧栏 tab 仍有空间。 |

#### (d) `packages/experimental/timeline` 与压缩 / 任务的关系

**与压缩：完全无关。** 全包 `grep -i compaction` 只命中 `prompt.ts` 里的 `compactScript`（中/日文正则）与 CSS 的 `compact` 密度档——**没有任何压缩交互**。

**与任务：它是 DSH 官方自己的「任务树」实现**，与 issue 的 taskline 概念高度重叠：

| 维度 | Timeline | issue 的 taskline |
|---|---|---|
| 持久化 | `plugin:timeline/tree` 等 plugin record（`src/storage.ts:446`） | `plugin:taskline/tree` plugin record |
| 任务结构 | tree + subtask + weight + priority + status（pending/active/paused/blocked/done/retired） | tree + subtask（`parentTaskId`）+ outcome |
| 状态存储 | `plugin:timeline/tree` / `plugin:timeline/priority` / `plugin:timeline/annotation` / `plugin:timeline/request` / `plugin:timeline/report` … | 单一 `plugin:taskline/tree` |
| Dock | `conversation.input.dock` 槽位，id `timeline`，order 20（`src/client/index.ts:254-262`） | issue §5.1 要求同一槽位 |
| 命令 | `/timeline`（`src/command.ts`） | issue §5.4 要求 `/taskline gate off` |
| 压缩 | 无 | 核心卖点 |

→ **issue 必须处理的两点**：(1) Dock 槽位与 Timeline 抢同一个 `conversation.input.dock`（两者可共存，slot list 语义，但 UI 拥挤）；(2) **功能定位与官方 Timeline 大面积重叠**——建议在文档里明确差异化（Timeline 做「进度追踪 + 定时报告」，taskline 做「区间压缩」）。

Timeline 还**默认替换 Todo 工具**（README：「Replace Todo tools (recommended) is on by default when Timeline is enabled」）——若 taskline 也注册任务类工具，两者会撞。

---

## ③ 与 issue 描述不一致处 + 真实机制

### 不一致 1（最致命）：任务区间不能用数字 seq 区间表达

- **issue 说**：`TaskRecord.startSeq / endSeq`，注释「surface seq」；`task_complete` 判定「`endAt < startSeq` 或落在已被 shadow 的区间」。
- **真实机制**：surface 上的 seq **会在压缩后非单调**（`core/session/src/surface.ts:585` 的 splice 把高 seq 插到低位）。`shadowedRange.start > end` 是**官方承认的合法状态**（`compaction/src/types.ts:110-113`、`docs/subsystems/compaction.md:62-64`）。
- **正确做法**：
  1. `TaskRecord` 同时存 **surface 位置**（`startPos/endPos`）与 **seq 快照**（`startSeq/endSeq`，仅作 ID/展示）。
  2. 所有「是否交叠」「是否被 shadow」的判定走 **位置**。
  3. 每次压缩落盘后，用 `CompactionResult.shadowedSeqs` 把被 shadow 的任务标记为「已压缩」，并把 `startPos/endPos` 折算到压缩后的 surface 位置（`session.surface.nodes.indexOf(replacementSeq)`）。
  4. 「已 shadow」判定用 **`sourceEventSeqs` / `shadowedSeqs`**，而不是比较数字大小。

### 不一致 2：禁用 `compaction-basic` ≠ 提供替代 compaction 服务

- **issue 说**（§2 组合包）：`- id: compaction-basic` + `disabled: true`，理由是「taskline-compactor 提供了替代的 compaction 服务」。
- **真实机制**：
  - `disabled: true` → 插件**不挂载** → `ctx.compaction` 不存在 → `command-compact`（`inject: ['commands','compaction']`）**永不激活** → **`/compact` 消失**（`vendor/loader/lib/index.js:361-364` + `vendor/cordis/src/fiber.ts:639-646`）。
  - DSH 的**自动压力压缩**（pre-step / 模型切换 / 溢出恢复）也一并消失。
  - 想「保留服务、只关自动」→ **`config: { auto: false }`**（`compaction-basic/src/index.ts:149`）。
  - 想「提供替代服务」→ **不能 disable 原件**，因为同名 `provide` 会抛 `service "compaction" has been registered at <...>`（`vendor/cordis/src/reflect.ts:326-330`）。
- **正确做法**：**保留 `compaction-basic`**，让 taskline 的压缩器作为**上层编排者**（调用 `ctx.compaction.compactRegion`）而不是**替换者**；或用不同服务名 + 显式路由。

### 不一致 3：`/compact` 的真实语义

- **issue 说**（§4.0）：「手动：`/compact` 也走同一条路——压所有已标记可压缩的任务区间」。
- **真实机制**：`/compact` → `compactNow` → `selectCompactableRange(session, measure, **0**)` → **压掉除受保护 system head 外几乎整个 surface**；且要求 **agent 空闲**；且**没有任务概念、没有「可压缩标记」**。
- **正确做法**：若要「`/compact` 只压已关闭任务」，taskline 必须**自己注册 `/compact`**（并处理与 `command-compact` 的命令名冲突，见 §④）。

### 不一致 4：cordis 同名服务不是「后注册的赢」，而是**直接抛错**

- **issue 说**（§4.2）：「后注册的赢：如果同时装了 `compactor` 和 `compactor-bili`，bili 的覆盖默认的」；「卸载即回退」。
- **真实机制**：`ctx.provide('taskline:compactor', ...)` 第二次调用**抛异常** `service "taskline:compactor" has been registered at <...>`（`vendor/cordis/src/reflect.ts:326-330`）→ 第二个插件加载失败，不是「覆盖」。
- **正确做法**：用一个**列表服务**（`taskline:compactors: TasklineCompactor[]`）+ 一个**选择服务**（`taskline:compactor`），或者用 entry 的 `disabled` 开关做热插拔。DSH 自己的做法可参考 `ctx.get('toolResultPruner')?.pruneSession(...)` 这种**可选兄弟服务**模式（`compaction-basic/src/index.ts:18` 的 type-only import + `ctx.get(...)`）。

### 不一致 5：`compactSurfaceRegion` 不是公开 API；`BasicCompactionEngine` 只有一个钩子

- **issue 说**（§4.3/§4.4）：「拿到摘要后走 `compactSurfaceRegion` 落盘」；「通过 DSH 引擎落盘（re-export `BasicCompactionEngine`）」。
- **真实机制**：`compactSurfaceRegion` 导出在 `compaction-basic/src/region.ts:174`，但包 `exports` 无 `./region` 子路径，发布 tarball 只有 `src/region.ts`（裸 TS）+ `lib/types/region.d.ts`（类型），**没有 `lib/types/region.js`**。第三方 `import { compactSurfaceRegion } from '@deepseek-ai/dsh-compaction-basic/region'` → **`ERR_PACKAGE_PATH_NOT_EXPORTED`**。
- **正确做法**：
  - **推荐**：继承 `BasicCompactionEngine`，只覆写 `protected async summarize()`（`compaction-basic/src/index.ts:288`）→ 摘要文本是你的，事务/落盘/计价是 DSH 的，**完全满足 issue「必须产生真实的 DSH compaction 事务」的要求**。
  - 若必须完全自控事务 → 写自己的 `CompactionEngine` 子类，自行实现 start/summary/end/replace（照抄 `region.ts` 的逻辑），代价是丢掉 DSH 的配对校验、影子价格协议、稳定性重校验。

### 不一致 6：80/60 滞回与 summaryDepth 都是 DSH 没有的东西

- **issue 说**（§3.6 `summaryDepth: 2`、§5.5「低水位 60%」、§7「80/60 滞回」）。
- **真实机制**：
  - 阈值 = `floor(min(W × 0.8, W − O − B))`，`B = 65536`（`compaction-basic/src/config.ts:20,75,191-194`）。**不是 `0.8 × W`**。
  - **没有低水位、没有滞回**：压缩循环的目标是「降到阈值以下」（`compaction-basic/src/index.ts:370-383`）。
  - **没有 `summaryDepth`**：摘要节点会被后续压缩**重新摘要并合并成一层**（`compaction-basic/src/summarizer.ts:69` 的指令明确要求合并）。
- **正确做法**：`summaryDepth` 由 taskline 在**区间选择层**实现（每次只摘要「本任务区间」而不是整条 surface，天然形成多层）；「低水位」同理，由 taskline 自己控制压到哪停——**不依赖 DSH**。

### 不一致 7：`history_read` / `history_search` 不存在；`compress` 工具也不存在

- **issue 说**（§4.1 `recall` 注释、§5.3「`task_*` / `compress` / `history_*` 工具的调用渲染为紧凑卡片」）。
- **真实机制**：
  - `history_read` / `history_search`：**0 命中**，提案仍是 `Status: proposed`。
  - **`compress` 工具也不存在**：DSH 只有 `/compact` 这个**人类命令**（`command-compact`），**没有**模型可调用的 `compress` 工具。
  - `tool-session-query` 的 5 个工具（`session_search` / `session_event_search` / `session_trace` / `session_event_trace` / `session_event_read`）**在 0.2.2-alpha.3 就已存在**，事件分类含 `shadowed`；0.2.3 没有新增召回工具。
- **正确做法**：
  - issue §3.5「压缩门禁：在 compress 类工具执行**之前**拦截」——**DSH 没有 compress 类模型工具**。门禁要拦的是 **(a) taskline 自己的 `task_complete` 触发的压缩**，以及 **(b) 若 taskline 自己注册 `compress` 工具**。如果打算注册 `compress` 工具，那是 taskline **新增**的工具，门禁也由 taskline 实现。
  - `recall()` 直接用 `session.eventAt(seq)` 读原文即可（append-only 日志保留全部字节）；若要与模型可见的检索工具打通，用 `tool-session-query`。

### 不一致 8：entry id 与 npm 包名不一致；`bili-compaction-gate` 不存在

- `tool-result-pruner` 的 entry id **不带** `compaction-` 前缀；`compaction-image-offload` 的 entry id 是 `image-offload`。
- `bili-compaction-gate` 在 DSH 全仓库不存在。

### 不一致 9：任务区间与「受保护 system head」冲突

`compaction-basic/src/region.ts:351-353` + `core/session/src/surface.ts:499-513`：surface node 0 若是 `system/message`，任何覆盖它的 replace 都必须本身是 `system/message` 且只覆盖一个节点；压缩侧直接拒绝「区间包含受保护的首个 system 消息」。

→ **issue 的任务区间必须显式从「第一个非 system 节点」开始**，否则第一次压缩就抛错。

### 不一致 10：失败语义不是「三事件齐全或一个不写」

见 §2.2(d)。真实形态：`start` 一定写；失败时 `start` + `end(error)`，**summary 与 replace 不写**；`end` 也失败才留孤儿 `start`。

### 不一致 11：并发是「拒绝」不是「排队」

DSH 的持久锁在第二个并发请求上抛 `ManualCompactionError('busy')`（`region.ts:317-320`）。issue §6「并发 compress → 串行队列，一次只处理一个落盘事务」必须由 taskline **自己实现队列**。

### 不一致 12：web-app bundle 的 `compaction` 服务是 **preset 组内隔离**的

`packages/bundle/web-app/cordis.patch.yml:613-621` 在 host 层 disable 了 `compaction-basic` / `command-compact` / `tool-result-pruner`；`packages/bundle/web-app/presets/cordis.patch.yml:68-85` 在 `compaction` group 里以 `isolate: { compaction: true, toolResultPruner: true }` 重新挂载。

→ host 平面（group 外）的 `ctx.compaction` 是 **undefined**。taskline 若在 host 平面注册自己的 `ctx.compaction`，`/compact`（绑定在 preset 组内）**不会**调到它。

---

## ④ 需实测确认项

| # | 待确认 | 为什么源码读不出来 | 怎么测 |
|---|---|---|---|
| 1 | 第三方插件能否 `import { compactSurfaceRegion } from '@deepseek-ai/dsh-compaction-basic/src/region.ts'` 并在 Node 24 下运行 | 该路径是裸 TS（`.ts` 扩展），需要 Node type-stripping；且它的传递依赖全是 `compaction-basic` 的 peerDependencies（npm 实测为精确版本 `0.2.3-alpha.2`） | 在隔离 profile（`DSH_HOME` + 独立端口）里装一个最小插件试 import；看是否 `ERR_PACKAGE_PATH_NOT_EXPORTED` / 类型剥离错误 / peer 解析失败 |
| 2 | `ctx.commands.register` 注册同名 `/compact` 会怎样（覆盖 DSH 的 `command-compact`？报错？两条并存？） | `packages/core/commands/` 的同名注册语义未逐行核实 | 隔离实例里同时挂 `command-compact` 与一个自注册 `compact` 的插件，看命令解析结果 |
| 3 | `ctx.compaction.compactRegion(start, end, agent, signal)` 从**工具执行期**（turn 开着）调用是否稳定 | 理论可行（`owner: 'current-turn'` 需要 open turn；`stability: 'whole-surface'` 要求摘要期间 surface 不变），但 agent-loop 是否会在 await 期间追加 surface 事件（`developer/message`、`system/message` 重建）未验证 | 用 mock provider + 一次带 tool call 的会话，在 tool 里调 `compactRegion`，观察是否抛 `SurfaceChangedError` |
| 4 | `compactRegion` 对「跨压缩点的任务区间」（区间内含已被 shadow 的节点）会怎样 | `validateSurfaceRegion`（`region.ts:338-364`）只查「seq 是否还在当前 surface」，语义明确但未跑过 | 构造两次连续压缩后，用旧的 seq 调 `compactRegion`，观察错误文本 |
| 5 | 同一 context 里第二个 `CompactionEngine` 子类（`super(ctx,'compaction')`）是否真的抛 `service "compaction" has been registered` | `vendor/cordis/src/reflect.ts:326-330` 是通用 `provide` 路径，但 `Service` 的 isolate realm 细节未跑过 | 两个最小插件同时 `class X extends CompactionEngine`，看异常文本与插件加载结果 |
| 6 | `plugin:taskline/tree` 这类第三方 plugin record 在 **fork / restore** 后能否完整重建任务树 | `appendPluginRecord` 的持久化依赖 `session-persistence-*` 插件对 ignorable 事件的处理（`packages/session/session-log-deepseek/`） | fork 一个有任务记录的会话，检查 `pluginRecordOf` 读回结果 |
| 7 | `Session.append` 的校验错误文本在 0.2.3 是否变化（`core/session/src/validation.ts` 新增 570 行） | 纯重构，但错误文本可能被测试断言固定 | 故意提交一个非法 replace，看报错文本 |
| 8 | taskline 的 dock 与官方 Timeline 的 dock 在 `conversation.input.dock` 槽位里并排后的实际观感 | slot list 是渲染期行为 | 隔离实例同时开 Timeline + taskline |
| 9 | `tool-session-query` 在**当前会话**内能否检索到「本会话被 shadow 的原文」 | `session_event_search` 描述明说排除当前 step；跨 step 是否排除整个当前会话未验证 | 在有压缩的会话里调 `session_event_search` 搜 shadowed 文本 |
| 10 | `ctx.tokenMeter.measure(session).totalTokens` 与 `contextPressure().projectedTokens` 的偏差量级（压缩后多久收敛） | 两者语义不同（`:152-201` vs `:114-130`） | 压缩前后各测一次并对比 |

---

## ⑤ 来源

### DSH 源码（一手，commit `4b399c39a6`，`dsh-v0.2.3-alpha.2`）

**会话 / surface**
- `packages/core/session/src/types.ts:33`（`SessionSeq`）、`:451-459`（`SurfaceEventType`）、`:477-479`（`SurfaceOp`）、`:484-492`（`SurfaceIntent` / `sourceEventSeqs`）、`:506-534`（`SessionEvent`）、`:538-544`（`PluginRecordType`）
- `packages/core/session/src/surface.ts:1-6`（surface 定位）、`:50-65`（surface-eligible 类型）、`:222-232`（`SurfaceFoldReplacement` / `shadowedSeqs`）、`:234-242`（`SurfaceFoldResult`）、`:251-261`（`SessionSurface`）、`:299-308`（`isReplaceOp`）、`:311-336`（`surfaceOpOf`：ignorable 不进 surface）、`:338-374`（`assertSourceEventReferences`）、`:422-443`（`replacementRange`：按位置）、`:464-492`（`assertToolResultRewrite`）、`:499-513`（`assertSystemHeadRewrite`）、`:515-561`（`planSurfaceEvent`）、`:577-600`（`applySurfacePlan`：splice → 非单调）、`:609-624`（`foldSurface`）、`:668-701`（`prepareBatch`）
- `packages/core/session/src/index.ts:230-252`（`appendPluginRecord` + 仓库内 gate 说明）、`:266-270`（`pluginRecordOf`）、`:619-643`（`#appendRecord`：`seq = log.length`、`ignorable: true`）

**压缩**
- `packages/compaction/compaction/src/index.ts:16-23`（公开导出）、`:32`（`CompactionTrigger`）、`:35-41`（`ManualCompactionErrorCode`）、`:48-64`（`ManualCompactionError`）、`:67-70`（`CompactionAgentContext`）、`:77-86`（`ManualCompactAgentContext`）、`:88-91`（`ctx.compaction` 合并）、`:106`（`compaction/summary-error`）、`:119-193`（`CompactionEngine` 三抽象方法）
- `packages/compaction/compaction/src/types.ts:24`（`compaction/start`）、`:34-67`（`compaction/summary`）、`:72`（`compaction/end`）、`:82-89`（`compaction/prune`）、`:94-120`（`CompactionResult` + 非单调说明 `:108-113`）
- `packages/compaction/compaction/src/checkpoint.ts:32-50`（`compactCheckpointSource` / `isCompactCheckpointSource`）
- `packages/compaction/compaction/src/tool-pairing.ts`（`toolPairingBalancedBefore/After`）
- `packages/compaction/compaction-basic/src/index.ts:119-134`（`BasicCompactionEngine` + `Config`）、`:145-150`（构造 + `auto`）、`:162-273`（自动触发三监听）、`:288-298`（`summarize()` 唯一钩子）、`:310-331`（`compactIfNeeded`）、`:334-389`（`compactPressure`）、`:400-415`（`compactRegion`）、`:425-477`（`compactNow`）、`:480-491`（`regionDependencies`）
- `packages/compaction/compaction-basic/src/region.ts:118-156`（`selectCompactableRange`）、`:174-277`（`compactSurfaceRegion` 事务）、`:309-321`（`assertCompactionInactive`）、`:328-335`（`assertNoActiveCompaction`）、`:338-364`（`validateSurfaceRegion`，`:351-353` 受保护 system head）、`:366-390`（`prepareCompaction`）、`:437-474`（稳定性重校验）、`:477-528`（`commitCompactionBody`，`:512-515` replace + `sourceEventSeqs`）、`:550-569`（`buildSummarizationInput`）、`:572-605`（`inspectCompactionEntryState`）
- `packages/compaction/compaction-basic/src/config.ts:20`（0.8）、`:23`（0.16）、`:75-76`（headroom 65536）、`:105-108`（retries / auto）、`:153-217`（`resolveCompactSpec`）、`:235-239,292-294`（互斥与校验）
- `packages/compaction/compaction-basic/src/summarizer.ts:66-69`（合并旧 checkpoint 的指令）、`:140-160`（`purpose: 'compaction'`）、`:186-192`（`frameSummary`）
- `packages/compaction/compaction-basic/src/answered-route.ts:1-27`（0.2.3 新增）
- `packages/compaction/command-compact/src/index.ts:12-13`（name / inject）、`:24-57`（失败文案）、`:60-80`（`executeCompact`）、`:86-109`（注册）
- `packages/compaction/compaction-tool-result-pruner/src/index.ts:51-68`（服务名 `toolResultPruner`）、`:136-180`（`pruneSession` + `compaction/prune`）
- `packages/compaction/compaction-image-offload/src/index.ts:33`（`compaction/summary-error` 消费方）

**token meter**
- `packages/llm/token-meter/src/index.ts:114-130`（`contextPressure`）、`:152-201`（`measure`）、`:220-225`（`estimateMessage`）
- `packages/llm/token-meter/src/types.ts:23-55`（`TokenMeasurement` / `TokenSurfaceNode`）
- `packages/llm/token-meter/src/surface-projection.ts:68-74`、`breakdown-projection.ts:154-160`（影子价格相邻性）

**session-query / 召回**
- `packages/experimental/tool-session-query/src/index.ts:16-19`、`:51-54`（prompt）、`:66-122`（5 个工具）
- `packages/session-query/session-query/src/documents.ts:14-56`（records / documents）、`:59-82`（`classifySurface`：current/shadowed/log-only）
- `packages/session-query/session-query/src/types.ts:38-39`、`:128-136`（`replacedBy` / `replacementChain` / `replacedEventSeqs`）、`:235`（surface 过滤器）

**Timeline**
- `packages/experimental/timeline/src/index.ts:19`（`name = 'timeline'`）、`:22-30`（inject）
- `packages/experimental/timeline/src/records.ts:254-266`（`PluginRecordMap` 合并范例）
- `packages/experimental/timeline/src/storage.ts:446`（`appendPluginRecord`）
- `packages/experimental/timeline/src/client/index.ts:254-262`（`conversation.input.dock`，id `timeline`，order 20）

**cordis 条目 / bundle**
- `packages/bundle/base/cordis.patch.yml:363-372`（`token-meter` / `compaction-basic` / `command-compact`）、`:446-450`（`tool-result-pruner`）、`:455-456`（`image-offload`）
- `packages/bundle/web-app/cordis.patch.yml:606-621`（host 层 disable 三项）
- `packages/bundle/web-app/presets/cordis.patch.yml:68-85`（`compaction` group + isolate）
- `packages/bundle/sdk-minimal/cordis.patch.yml:61-68`

### vendored cordis / loader（一手）
- `vendor/cordis/src/reflect.ts:326-330`（同名 provide 抛错）、`:388`（同名属性声明抛错）
- `vendor/cordis/src/service.ts:38-60`（Service → `reflect.provide`）
- `vendor/cordis/src/fiber.ts:639-646`（`_refresh`：inject 缺失 → INACTIVE）、`:320-346`（publish 后解析依赖）
- `vendor/loader/lib/index.js:336-346`（`Entry.disabled`）、`:361-364`（`refresh()` 遇 disabled 直接 return）、`:380-390`（`update()` 遇 disabled 卸载）
- `vendor/loader/src/config/isolate.ts:74-88`（LocalRealm / GlobalRealm）、`:96-155`（isolate 生效流程）
- `vendor/loader/src/index.ts:12`（`export const name = 'command-compact'` 同款模式）

### DSH 官方文档（一手，`docs/`）
- `docs/subsystems/compaction.md`（全文）：`:11`（三个事件——**漏了 prune**）、`:13-17`（payload 表）、`:19-21`（锁语义）、`:84`（服务 API 综述）、`:99`（失败分类）、`:101`（压力路径）、`:143-206`（生成的 Cordis API 目录）
- `docs/subsystems/session.md:11`、`:293-299`、`:318-339`（`SurfaceOp` 语义 + 「Positions follow surface order, not numeric sequence order」）、`:359-361`（`sourceEventSeqs`）、`:399-428`（`SessionSurface`）
- `docs/subsystems/token-meter.md:21-29`、`:58`（`contextPressure` vs `measure`）、`:114`、`:137`、`:145`
- `packages/compaction/compaction/README.md`（实现契约全文）
- `packages/compaction/compaction-basic/README.md`（阈值公式、配置表、`auto` 语义、`summarize()` 唯一钩子、区域事务）
- `packages/preset/agent-preset/skills/dsh-doc/references/packages.md:143-150`（compaction 包清单）

### 提案笔记（一手，状态 = proposed）
- `.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md`（`:52-56` 的 `history_read` / `history_search` 设计；`:24-50` 的 frozen index / state checkpoint / chunked pass）
- `.agents/notes/proposed/feature/2026-08-04-task-surface.md`（与本 issue 无关，仅备注命名冲突）

### npm 发布产物（一手，实测 `npm view` / `npm pack`）
- `@deepseek-ai/dsh-compaction-basic@0.2.3-alpha.2`：`exports` = `.` / `./src/*` / `./package.json` / `./locale/*.json`；tarball 含 `src/region.ts` + `lib/types/region.d.ts`，**无** `lib/types/region.js`
- `@deepseek-ai/dsh-compaction@0.2.3-alpha.2`：`exports` = `.` / `./src/*` / `./types` / `./checkpoint` / `./package.json`
- `@deepseek-ai/dsh-compaction-basic` 的 `peerDependencies`（精确版本）：`cordis ~4.2.0-alpha.1`、`dsh-llm` / `dsh-agent` / `dsh-session` / `dsh-commands` / `dsh-compaction` / `dsh-token-meter` / `dsh-session-projection` / `dsh-compaction-tool-result-pruner` 均 `0.2.3-alpha.2`

### Git（只读）
- `git log --oneline dsh-v0.2.2-alpha.3..HEAD -- packages/compaction/ packages/core/session/`（§2.9 的差异清单来源）
- `git diff --stat dsh-v0.2.2-alpha.3..HEAD -- packages/compaction/ packages/core/session/`
