# 研究报告 04（重写）：billion-context 作为 taskline 内置压缩器的适配可行性

> **版本基准**
> - DSH 一手源码：`/Users/mutou/vault/projects/deepseek-harness`，commit `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`，version **0.2.3-alpha.2**
> - billion-context 一手源码：`/Users/mutou/.cache/dsh-research/billion-context`，commit `ced22b1d2b0576ac3c6f8169f2ecbe9f3d8f3a45`，version **0.1.216**
> - 已装版本（本机实证）：**web profile 装了 0.1.205**（`~/.dsh/profiles/web/package.json`）；**desktop profile 未装**（`dependencies` 与 `dsh.profile.bundles` 均无 `billion-context`）
> - 被审查规格：`hyperion2144/dsh-taskline` issue #1 §4.4 / §6
> - 核查方式：**一手源码逐条比对**（DSH 源码 + bili 源码 + 本机已装产物 diff）。未修改任何 DSH / bili 源码，未做任何 git 写操作。
> - 本文档整体重写：旧版（基于 DSH 0.2.2-alpha.3 + 已装 0.1.205）只作为结构参考，其结论已按 0.2.3-alpha.2 / 0.1.216 重新核实，**并有若干结论被翻转**（见 §③ 末尾的「对旧版结论的修订」）。

---

## ① 结论摘要表

| # | 待核问题 | 真实情况（0.2.3-alpha.2 + 0.1.216） | 判定 |
|---|---|---|---|
| 1 | bili 的 `dsh.bundle.patch.yml` 插入哪些 entry | 顶层 `insert` 两个 entry：`bili-native`（`name: billion-context`）与 `bili-compaction-gate`（`name: billion-context/dsh-compaction-gate`）。`name` 由 loader 从 profile 的 `node_modules` 解析 | ✅ |
| 2 | 怎么设 `compaction-basic` | `- id: compaction-basic` + `config: { auto: false }`。**patch 语义是整键替换**（`config` 整块覆盖，不深合并），目标行不存在只 warn 跳过、不致命 | ✅ |
| 3 | 怎么设 `command-compact` | 0.1.216 **新增** `- id: command-compact` + `disabled: true`（#7154）。0.1.205 没有这一行 | ✅（新增行） |
| 4 | `bili-compaction-gate` 的机制 | 常驻 entry、`inject: []`；在 `internal/config` waterfall 里**按结构**改写 preset 的 `plugins` 树，把 `@deepseek-ai/dsh-compaction-basic` / `@deepseek-ai/dsh-command-compact` 行置 `disabled:true`；改写前先看 `globalThis.__BILI_DSH_COMPACTION_VERDICT__==='active'`；改写后 `ctx.reflect.provide('biliBasicCompactionPolicy')` 开闸；另包 `agentPresets.register()` 覆盖运行时注册的 preset | ✅ |
| 5 | bili-native 的 `inject` | `export const inject = ["tools","commands","agents"]` —— 等这三个 service 出现才激活 | ✅ |
| 6 | bili-native 的 `planNativeDsh` 生命周期 | 三态：`off`（`BILLION_CONTEXT_PLUGIN=0` / `BILI_NATIVE_DSH=0` / `BILI_PROVIDER_REWRITES` 存在）→ `attach`（`BILLION_CONTEXT_ATTACH` ?? `BILLION_CONTEXT_PROXY`）→ `spawn`（自起代理，临时端口 + 父 pid 看门狗）。`apply()` 里 `off` 直接 return；否则先 `declareDshCompactionActive()` 再注册工具 | ✅ |
| 7 | desktop / web 两个 profile 的差异 | 差异**不在 DSH 侧**（两者都 bundle `@deepseek-ai/dsh-web-app`，所以四个 preset 都在），而在**是否装 bili**：web 装了 0.1.205（bundle 层生效），desktop 没装（**零 bili entry**，preset 里的原生压缩完整武装） | ✅ |
| 8 | bili 侧插件协议 v2 的端点 | manifest / tool / status / compact / snapshot / fork / register / runtime-info / session-name / render / turn，全部在 `/__bili/plugin/*` 之下，**loopback-only + trusted-origin** 门禁 | ✅ |
| 9 | `compress` 参数形态 | **广告形态只有一个**：`{content: "<一个纯字符串>"}`，字符串里按 `m00150–m00220 optional topic` 头行拼多个区间 + 各自 markdown 摘要。解析器还接受数组 / JSON 编码数组 / 扁平单区间 / 截断抢救，但**不广告** | ✅ |
| 10 | `externalSummary` 默认值与摘要归属 | **默认关**（`config.externalSummary?.enabled === true` 才开）。关闭时**调用方提交的 summary 就是权威摘要**；开启时独立摘要服务产出权威摘要，模型提交的 summary 降级为**非权威 hint** | ✅ |
| 11 | `compressibleRanges` 的坐标 | `{startRef, endRef, count, tokens, chars?, toolPct, textPct, …}`，ref 形如 `m00001`（5 位零填充）——**bili 的 ref 空间**，不是 DSH seq、也不是 DSH message id | ⚠️ 坐标需桥接 |
| 12 | `biliMsgIds` / `biliLedgerSeqs` 的 pin 规则 | 严格全有全无：数组长度必须 == 消息数、每项非空 ≤512、不以 `acp_summary_` 开头、无空白/控制字符、无重复；**任何一条不合 ⇒ 整批拒绝**，降级为内容派生 id。seqs 允许非单调/不连续。**且只有 pluginMode（请求带 `x-bili-plugin` 头）才 pin** | ⚠️ 有前提 |
| 13 | snapshot 的 `rawId` 在 host-pinned 会话里是否等于宿主 message id | **是**（协议文档 §8 明说；代码里 fork 的 msgid 轨就是拿 `prefixMsgIds` 逐项比对 parent 的 `rawId`）。但**只在 pin 成功时成立**；pin 失败时 `rawId` 是内容摘要 | ✅（有前提） |
| 14 | `protectedTools` 导致的 `ref:null` | 被 `compress.protectedTools`（及内建 `compress`/`acp_rule`）命中的消息，内核不给数字 ref（`BLOCKED_REF`），snapshot 里映射成 `ref: null`，**仍参与顺序与身份**，必须逐字提交 | ✅ |
| 15 | **origin 发现**：插件进程能否看到 `BILLION_CONTEXT_PROXY` | **看启动形态**：只有经 `bili dsh` 启动的 dsh 子进程才有该 env（launcher 显式 `env.BILLION_CONTEXT_PROXY = origin`）；桌面 app / 直接 `dsh web` 没有。插件与宿主同进程 ⇒ env 可见 | ⚠️ 不可靠 |
| 16 | **origin 发现**：dsh-native 注册的 `/bili/origin` 路由 | 路由在 **DSH 的 web 端口**（不是 bili 代理端口），`kind:"exact"`。但 DSH 的 `WebRoute.auth` **默认 `required`** ⇒ 未鉴权请求拿不到；进程内 `webServer.readResource` 只服务 `resource` 路由，而 bili 挂的是 `handler` 路由 ⇒ **进程内也读不到** | ❌ 第三方插件用不了 |
| 17 | conversationId 与 DSH `session.id` 是否恒等 | **恒等**。bili 取 `llm/stream` 的 `options.sessionId`（回落 `ctx.agents.currentInitiator()?.session?.id`），DSH 侧那就是 `this.session.id` | ✅ |
| 18 | fork / resume 后是否变化 | **resume 不变**（同 id 复用）；**fork 变**（`Session.fork()` 铸新 id，`isSeeded:true` + `parentSession`，bili 侧有 fork-child adoption 兜底） | ✅ |
| 19 | DSH message id → bili ref 的完整链路 | `MessageBase.id` → `llm/stream` 的 `options.messages[].id` → `hostMsgIdsOf`（全有全无）→ `resolveEnvelopeMsgIds`（wire⇔host lockstep 指纹 + core 对齐）→ body 字段 `biliMsgIds` → 代理 `applyMsgIdPin` 覆写 `m.id` → 内核 `assignRefs` 发 `mNNNNN` | ✅ |
| 20 | 哪些消息没有 id | `RequestUserInput.id?: never`（一次性 user 输入）；`resolveEnvelopeMsgIds` 另外排除 system/developer（它们走 hoisted 的 system 槽，不 1:1 对齐 wire 元素） | ✅ |
| 21 | pin 失败时的退化与断点检测 | 退化 = **内容派生 id**（ref 仍是 `mNNNNN`，但与宿主 message id 失去对应）。**没有专门的断点检测接口**：客户端只能自己比对 `snapshot.orderedMessages[].rawId` 是否等于它知道的宿主 id | ⚠️ 需自建检测 |
| 22 | 一次 `compress` 能否提交多个不连续区间 | **能**（content 一个字符串里多段头行，每段各自 summary）。协议文档明确要求批量合并成一次调用 | ✅ |
| 23 | 被拒时的 `outcome` / `result` 形态 | HTTP **仍是 200**，`ok:true`；`outcome ∈ {applied, partial, refused}` + `blocksCreated`，拒绝理由在 `result` 文本里（`reason` 只在服务端日志）。**不是 4xx** | ✅ |
| 24 | `externalSummary` 关闭时 taskline 自己的 summary 是否权威 | **是**。内核把调用方提交的 summary 直接写成 block 内容 | ✅ |
| 25 | 隔离 profile 怎么装 bili | `package.json` 的 `dependencies` 写 `"billion-context": "0.1.216"` + `dsh.profile.bundles` 数组加 `"billion-context"`（**裸包名**，不是 `@deepseek-ai/...`）。或用 `bili dsh` 启动器挂 `$DSH_HOME-bili/.bili-acp.patch.yml` overlay —— **两者只能二选一**，同时用会因重复 entry id 硬失败启动 | ✅ |
| 26 | desktop 未装的现状与自禁用策略 | desktop 零 bili entry ⇒ 原生压缩武装。协议文档 Obligations #4 给出规范：**插件在「自己的 baseURL 不指向 bili 代理」时自禁用** | ✅ |
| 27 | 第三方 DSH 插件做 bili wire 后端，**最大的缺口** | **bili 的压缩状态只由「经过代理的模型请求」喂养**。`/__bili/plugin/*` 全部作用于代理侧的会话，没有「上传历史」的入口 ⇒ 第三方插件**必须自己接管模型流量**（fetch 拦截 / 改 provider baseURL）才能让 bili 有会话可压 | ❌ 硬缺口 |

**总评**：bili **可以**作为 taskline 的 wire 级压缩后端，但它是「代理持有会话、代理持有折叠状态」的架构，不是「库」。第三方插件要用它，必须同时做三件事：**(a) 让模型流量经过 bili 代理**；(b) 用宿主 message id 做 ref 桥接**（依赖 `biliMsgIds` pin 成功）；**(c) 自己拿 origin**（`/bili/origin` 这条路对第三方插件是断的）。三件事缺一，bili 就退化成「匿名 wire 模式」——不压缩。

---

## ② 逐条核实

### 2.1 DSH 侧：bundle patch 的加载与语义

**patch 文件从哪来**：`dsh.bundle.patch` 声明一个或多个相对包根的 patch 文件，按声明顺序应用。

- `packages/boot/app-boot/src/profile.ts:54-62` — `bundlePatchFiles(bundle)`：`string` → 单文件；`string[]` → 按序多文件；其它形态抛错。
- `packages/boot/app-boot/src/profile.ts:69-71` — `bundlePatchPaths(packageDir, bundle)` → 绝对路径数组。
- `packages/boot/app-boot/src/profile.ts:755-762` — `composeEntries(layers, warn)`：把**所有 layer** 的 patch 列表 flatten 成一份，一次性 `applyEntryPatches([], …)`。layer 顺序 = `dsh.profile.bundles` 顺序（`profile.ts:91-92`）。
- `packages/boot/app-boot/src/profile.ts:7-12`（文件头注释）明确写了两条纪律：**「后写的 bundle patch 和用户自己的 `cordis.patch.yml` 按 id 寻址这些行，最后一次写入胜出」**、**「patch 替换目标行整个 `config`，不做深合并」**。

**`applyPatches` 的精确语义**（`vendor/include/src/patch.ts:105-181`）：

| patch 字段 | 行为 | 行号 |
|---|---|---|
| `insert`（无 id） | 追加到**顶层** entry 列表 `data.push(...clone)` | `:140-151` |
| `insert`（有 id） | 目标必须是 group（否则 warn 跳过）；追加进该 group 的 `config` 数组 | `:142-148` |
| 目标行不存在 | `warn('patch: entry %C not found')` → **跳过，不致命** | `:155` |
| `name` 不匹配 | `warn('patch: name mismatch …')` → **跳过** | `:156-158` |
| `config` / `inject` / `disabled` / 其它键 | **整键替换**：`target[key] = value`（**不是深合并**） | `:167-170` |
| group 的 `config` 被替换 | 该 group 原有的子 entry 全部卸载（`unmount`） | `:161-163`、`:173-178` |

**entry 的 `inject` 与 `disabled` 语义**：

- `vendor/loader/src/index.ts:154` — `Inject.resolve(fiber.entry!.options.inject, fiber.inject)`：entry 的 `inject` 列表声明「**等这些 service 出现才激活**」。
- `vendor/cordis/src/registry.ts:73-92` — `Inject.resolve`：数组形式 → `result[name] = null`（只记名字，不带 intercept 配置）。
- `vendor/loader/src/config/entry.ts:20`（`disabled?: boolean | null`）、`:92-93`（`get disabled()`，含 `!!js` 表达式求值）、`:133`（`if (this.disabled) return` —— **disabled 的 entry 直接不加载**）。

**结论**：bili 的 patch 里 `- id: compaction-basic / config: {auto:false}` 会把该行**整个 config 换成 `{auto:false}`**；`- id: preset-standard / inject: [biliBasicCompactionPolicy]` 会把该行**整个 inject 列表换成这一个名字**（DSH 若将来给 preset 自带 inject，必须手动合并——bili 在 patch 注释里明确警告了这点）。

### 2.2 DSH 侧：`compaction-basic` / `command-compact` 到底在哪

| 层 | 位置 | 状态 |
|---|---|---|
| 宿主层（base bundle） | `packages/bundle/base/cordis.patch.yml:366-367`（`compaction-basic`）、`:371-372`（`command-compact`） | 启用，**无 config**（走默认值） |
| 宿主层（web-app bundle 覆盖） | `packages/bundle/web-app/cordis.patch.yml:613-614`、`:616-617` | **`disabled: true`**（web-app 把宿主层这两行关掉） |
| preset 内层（活的那份） | `packages/bundle/web-app/presets/standard.patch.yml:72-86`（`compaction` group 内嵌 `compaction-basic` / `command-compact` / `tool-result-pruner`）；其余三个 preset 同构 | 启用 |

四个 preset 文件（`standard/ptc/minimal/cordis`）由 web-app bundle 的 `dsh.bundle.patch` 数组统一挂载（`packages/bundle/web-app/package.json:50-58`）⇒ **只要 profile bundle 了 `@deepseek-ai/dsh-web-app`，四个 preset 行都在**。

`auto` 的默认值：`packages/compaction/compaction-basic/src/config.ts:71-72`（必须是 boolean）、`:108`（`auto: config.auto ?? true`）；类型注释 `packages/compaction/compaction-basic/src/types.ts:49-50`（"Defaults to `true`"）。

**这解释了一个关键事实**：bili patch 的 `compaction-basic / config:{auto:false}` 在 **web profile 里是空操作**（该行已被 web-app bundle `disabled:true`，config 无从生效）；真正需要压制的是 **preset 内部那一份**——而那一层任何 patch 都按 id 命不中（它在 `plugins` 嵌套树里，没有自己的顶层 id）。这正是 `bili-compaction-gate` 存在的原因。

### 2.3 `bili-compaction-gate` 的真实机制

**入口**：`src/agent/dsh-compaction-gate.ts`

- `:29-30` — `export const name = "bili-compaction-gate"; export const inject: string[] = [];`（**无任何依赖** ⇒ 只要 bundle patch 被挂载，它就激活，与 bili-native 的生死无关）。
- `:41-47` — `apply(ctx)`：`registerCompactionDisable(ctx)` + `ctx.inject(["loader"], …)` 读 loader 的 entry 列表做「宿主层 override 丢失」告警。

**核心**：`src/agent/dsh-compaction-disable.ts`

| 机制 | 位置 | 说明 |
|---|---|---|
| 服务名常量 | `:64` | `BILI_COMPACTION_DISABLE_SERVICE = "biliBasicCompactionPolicy"` |
| verdict 通道 | `:89` / `:92-98` | `globalThis.__BILI_DSH_COMPACTION_VERDICT__ === "active"`。**用 globalThis 是因为 gate entry 与 bili-native 是两个独立 bundle，模块状态不共享** |
| 声明方 | `src/agent/dsh-native.ts:2092` | `declareDshCompactionActive()` —— 只在 `apply()` 且 `plan.mode !== "off"` 时调用 |
| 加载期改写 | `:313-334` | `ctx.on("internal/config", (fiber, next) => …, { global: true })`；先 `next()` 取 resolved config；**verdict 非 active 就原样返回**；否则结构匹配 `config.plugins` 树，命中 `compaction-basic`/`command-compact` 行就置 `disabled:true` |
| 改写纯函数 | `:220-232` | `disableBasicCompaction(rows)`：递归 group 行，命中包名就 `{...r, disabled:true}`；**不修改入参** |
| 结构匹配（#4147） | `:326-333` | 只要 `config.plugins` 里**任意深度**出现 compaction 行就整体改写 —— 不按 entry 名匹配，所以自定义 preset 也能覆盖 |
| 开闸 | `:337` | `ctx.reflect?.provide?.(BILI_COMPACTION_DISABLE_SERVICE, …)` —— **必须在中间件注册之后**，否则 inject 闸门可能在改写生效前就被满足 |
| 运行时 preset（#7190） | `:254-280` | 包 `agentPresets.register()`：运行期注册的 preset 定义绕过所有 config 层，改写在 `register()` 入口做 |
| 覆盖遥测 | `:110-198` | `__BILI_DSH_COMPACTION_GATE_TELEMETRY__` 全局记录改写了哪些 entry；`compactionCoverageText()` 出一行摘要 |
| 宿主层失守告警 | `:371-391` | `hostPlaneRowsMissingAutoFalse(entries)`：若某层重写了 `compaction-basic` 的**整键 config**，`auto` 回落 `true` ⇒ **原生自动压缩重新武装** ⇒ 告警文案点名 entry id |

**preset 的 inject 闸门**：bili patch 给四个 preset 行加 `inject: [biliBasicCompactionPolicy]`（`dsh.bundle.patch.yml:43-50`）。loader 只在 `biliBasicCompactionPolicy` 被 `reflect.provide` 之后才让这些 preset 激活（`vendor/loader/src/index.ts:154` + `vendor/cordis/src/registry.ts:73-92`）。因此：

- bili-native 活着 ⇒ verdict active ⇒ 闸门开 ⇒ preset 激活 ⇒ 加载期改写把 preset 内的 compaction 关掉 ⇒ **bili 独占压缩车道**。
- bili-native 被 kill-switch 或 entry 被 disable ⇒ verdict 缺席 ⇒ 闸门**仍然开**（gate entry 独立常驻）⇒ preset 激活 ⇒ 改写**不生效** ⇒ preset 用**原生 DSH 压缩**（stock），而不是永远 pending。#3662 修的正是「旧接线把 gate 和 bili-native 绑在一起 ⇒ 关掉 bili-native 就把会话创建砖死」那个坑。

### 2.4 bili-native：`inject` 与 `planNativeDsh` 生命周期

`src/agent/dsh-native.ts`

- `:82-83` — `export const name = "bili-native"; export const inject = ["tools", "commands", "agents"];`
- `:204-206` — `shouldBootstrapNativeDsh(env)` = `nativeBootstrapGate(env, "BILI_NATIVE_DSH")`（`src/agent/native-bootstrap.ts:18-26`：全局 kill-switch `BILLION_CONTEXT_PLUGIN=0`、per-host `BILI_NATIVE_DSH=0`、已有 `BILLION_CONTEXT_PROXY`、`BILI_PROVIDER_REWRITES` 存在 ⇒ 不自举）。
- `:215-221` — `planNativeDsh(env)`：

  | 条件 | mode | 后续 |
  |---|---|---|
  | `BILLION_CONTEXT_PLUGIN==="0"` 或 `BILI_NATIVE_DSH==="0"` 或 `BILI_PROVIDER_REWRITES !== undefined` | `off` | `apply()` 直接 return，什么都不装 |
  | `nativeAttachOrigin(env) ?? proxyEnvOrigin(env)` 有值 | `attach` | 绑定 `register.base = attachOrigin`；先探活，死了回落 spawn（#983） |
  | 其它 | `spawn` | `ensureProxyRunning` 自起代理：临时端口 + 父 pid 看门狗（`src/launcher.ts:5710+`） |

  `BILLION_CONTEXT_ATTACH` 语义见 `src/agent/native-bootstrap.ts:44-61`（外部代理 attach 信号，`http(s)://` 归一化、去尾斜杠）；`BILLION_CONTEXT_PROXY` 语义见 `:28-42`。
- `:2076-2092` — `apply(ctx)` 顺序：`planNativeDsh(process.env)` → `off` 则 return → `originGen += 1`（新 origin 世界）→ **`declareDshCompactionActive()`** → `beginToolsOwner(ctx)` → 后续注册工具 / 路由 / 拦截。
- `:918-945` — `toolDefinition(tool)`：manifest 的 anthropic 条目 → DSH `ToolDefinition`：`parameters = tool.inputSchema`、`output.schema = {type:"string"}`、`render` 产出 `[{type:"text",text}]`；`execute` 用 **`exec.agent?.session?.id`** 当 conversationId，调 `forwardTool(base, sid, tool, args, exec.signal, nativeCaller=true, exec.callId)`；`out.failed`（outcome 是 `failure`/`refused`）时 **throw**（业务失败表现为工具错误，不是成功文本）。
- `:1002-1030` — `restoreTools`：注册冲突（"already registered"）时**采纳**既有注册，不报错；并监听 `tools/change` 在插件重载后恢复。
- `:2716-2760` — `headersFor`：盖 `x-bili-plugin: dsh`、`x-bili-plugin-conversation: <sid>`、`x-bili-plugin-purpose`（主轮盖哨兵 `"conversation"`，见 `src/plugin.ts:163-170`）、可选 `x-bili-plugin-model` / `x-bili-plugin-context-window` / `x-bili-plugin-max-output`。
- `:2100-2120` — `attributionOf(ctx)`：**sid 优先取 `llm/stream` 的 `options.sessionId`**（#4082），回落 `ctx.agents?.currentInitiator?.()?.session?.id`。
- `:2170-2183` — `/bili/origin` 路由定义（`kind:"exact"`, `path:"/bili/origin"`），返回 `{origin, relay?, contextTab, contextTabLabel?}`；`:2239-2257` — 通过 `ctx.inject(["webServer"], …)` 注册（含 disposer 组合）。
- `:315-436` — `__bili` 前缀路由是 **admin relay**：把浏览器收到的 admin 调用转发到 loopback 代理；`adminRelayEnabled()` 关闭时一律 404（fail-closed）。

### 2.5 desktop / web 两个 profile 的差异（澄清一个常见误解）

**DSH 侧没有差异**：`desktop` 与 `web` 两个 profile 的 `dsh.profile.bundles` **都**包含 `@deepseek-ai/dsh-web-app`（本机 `~/.dsh/profiles/desktop/package.json` 与 `~/.dsh/profiles/web/package.json` 均可核对）⇒ **四个 preset 行、web-app 的宿主层 `compaction-basic/command-compact: disabled` 覆盖，在两个 profile 里都成立**。

**差异只在「装没装 bili」**：

| | web profile | desktop profile |
|---|---|---|
| `dependencies` 含 `billion-context` | ✅ `0.1.205` | ❌ 无 |
| `dsh.profile.bundles` 含 `billion-context` | ✅ | ❌ |
| 因此挂上的 bili entry | `bili-native` + `bili-compaction-gate`（来自包内 `dsh.bundle.patch.yml`） | **零** |
| preset 内的原生压缩 | 被 gate 改写为 disabled（若 bili-native 活着）⇒ bili 独占 | **完整武装**（没有 gate，`inject` 闸门没人提供，但 preset 行也没有 inject 要求） |
| 宿主层 `compaction-basic` | 已 `disabled:true`（web-app） | 同左 |

⇒ **desktop profile 现在的状态是「DSH 原生压缩正常工作、bili 完全缺席」**，不是「bili 半装」。

### 2.6 bili 侧：插件协议 v2 的端点全集

**权威文档**：`docs/plugin-protocol.md`（首行："Status: protocol v2, experimental"）。

**路由表**（`src/server/admin.ts`）：

| 端点 | 方法 | 行号 | 作用 |
|---|---|---|---|
| `/__bili/plugin/manifest` | GET | `:515-529` | 取工具 schema（单一真源） |
| `/__bili/plugin/snapshot` | GET | `:530-532` | 取有序身份 + ref（fork 协议 v2 的输入） |
| `/__bili/plugin/fork` | POST | `:533-541` | 建子会话 |
| `/__bili/plugin/status` | GET | `:542-559` | 上下文/区块/可压缩区间 |
| `/__bili/plugin/tool` | POST | `:949-958` | 执行 compress/decompress/search_context/acp_status/acp_cache |
| `/__bili/plugin/register` | POST | `:960-993` | 预登记 conversation（无模型请求也能绑定） |
| `/__bili/plugin/runtime-info` | POST | `:995-1004` | 上报宿主自己的 model/window |
| `/__bili/plugin/attribution` | POST | `:1006-1017` | 上报归因健康 |
| `/__bili/plugin/compact` | POST | `:1019-1028` | 通知「宿主做了原生压缩」→ 代理标记 compaction 边界、归档失效区块 |
| `/__bili/plugin/session-name` | POST | `:1030-1039` | 宿主给会话命名 |
| `/__bili/plugin/render` | POST | `src/plugin-render.ts:22` | 出站前缀渲染 |
| `/__bili/plugin/turn` | POST | `src/incremental-lane.ts:71` | 增量轮次（`pluginIncrementalTurns` rollout，**默认 0%**） |

**门禁**（`src/server/admin.ts:228-240` + `:98-131` + `:163-170`）：

1. **loopback-only**：`isLoopbackAddress(req.socket.remoteAddress)`，非回环一律 403。
2. **trusted-origin**：`isTrustedAdminOrigin(origin, host, trustedHostnames)` —— Host 归一化后必须落在 `{localhost, 127.0.0.1, ::1}`（或绑定的具体主机名）；**无 `Origin` 头 ⇒ 直接放行**（非浏览器客户端路径）。
   ⇒ **第三方插件在同一台机器上用普通 `fetch` 打 `http://127.0.0.1:<port>/__bili/plugin/...` 是通的**（Node 的 fetch 自动带 `Host: 127.0.0.1:<port>`，归一化后是 `127.0.0.1`）。
3. **manifest 内容**（`src/plugin.ts:1167-1191`）：
   - `protocolVersion: PLUGIN_PROTOCOL_VERSION`（见 §③ 的不一致条目）
   - `toolNames: [...PROXY_TOOL_NAMES, ...absorb?, ...acp_rule?, ...acp_retrieve?, ...acp_read_original_image?, ...blockOps?]`
   - `tools: {anthropic[], openai[], responses[]}` —— 三种 wire 形态的 schema
   - `headers: {agent, conversation, contextWindow, maxOutput, model, instructionsMutable, compression}`
   - `toolEndpoint` / `statusEndpoint` / `runtimeInfoEndpoint`
   - `capabilities.externalSummary`（**仅在开启时出现**）：`{enabled:true, summaryOptional:true, submittedSummary:"hint", maxToolDurationMs}`
   - `capabilities.fork`：`{protocolVersion:2, acceptsProtocolVersions:[1,2], endpoint, snapshotEndpoint}`

### 2.7 `compress` 参数形态

**广告形态（唯一）**：`kernel/src/compress-tools.ts:47-110`

```jsonc
{ "type": "object", "properties": { "content": { "type": "string", "description": "ONE plain string holding ALL ranges …" } } }
```

- 顶层**无 `required`**、**无 `additionalProperties:false`**、**无 `oneOf/anyOf/allOf/not`**（Anthropic 拒收带顶层组合子的 tool schema）。
- `content` 是**一个纯字符串**，里面每段区间以 `m00150–m00220 optional topic` 头行开头，随后是该段的 markdown 摘要；**多段拼在同一个字符串里**。
- `kernel/src/compress-tools.ts:60-72` 的注释明确记录了演进：2026-10-26 起把数组形态与顶层 `topic` 从**广告**里结构性移除（引导解码模型会混搭分支），但**解析器仍全部接受**；2026-11-23 又把「字符串里放 JSON 编码数组」的邀请语删掉（两种广告形态 ⇒ 模型两种都不信）。

**解析阶梯**（`kernel/src/parse-compress-input.ts:79-105`、`:173-297`）：

1. 顶层单区间（无 `content`，直接 `startRef/endRef/summary`）→ `:180-190`
2. `content` 是数组 → 直接逐条校验
3. `content` 是字符串 → 依次尝试：行形式（`splitLineEntries`）→ JSON 编码数组 → 扁平单区间（`flatSingleRangeFromContent`）→ 字符串化的单条目对象（`stringifiedEntryFromContent`）
4. `content` 是对象 → 若是单条目对象或内嵌 `ranges` 数组，包装成数组（`contentSalvage`）
5. 整串 JSON 解析失败 → `salvageContentEntries` 抢救前缀里**完整**的条目（半截条目丢弃，**不猜**）

**条目校验**（`:660-692`）：边界字段别名 `startRef|startId|messageId` / `endRef|endId|messageId`；缺边界 → `reason: "missing range bounds (need startRef/startId and endRef/endId)"`；缺 summary → `reason: "missing summary"`；`topic` / `summaryMaxChars` 可选，顶层同名值会补到没自带的条目上（`:278-288`）。**无效条目被跳过，不致命**（`:463-480`）。

**行形式的分隔符白名单**（`:490-495`、`:528-537`）：`-` `–` `—` `…` `~` `..` `...` `to`；不认识的分隔符会**拒绝对**（宁可不折，也不把一个多消息区间悄悄缩成单条）。

### 2.8 `externalSummary`：默认值与摘要归属

- **默认关**：`src/external-summary-surface.ts:13-16` — `externalSummaryEnabled(config)` ⇔ `config.externalSummary?.enabled === true`。
- **开启时的语义**（同文件 `:6` 的 `EXTERNAL_SUMMARY_NOTE`）：「会话模型**只选区间**，配置的独立摘要服务产出**权威摘要**；模型提交的 `summary` 若有，只是**非权威 hint**，不是提交的摘要。全部候选失败则原文不变。」
- **对外暴露**：`src/plugin.ts:1189` — manifest 里 `capabilities.externalSummary = { enabled:true, summaryOptional:true, submittedSummary:"hint", maxToolDurationMs }`（**只在开启时出现**；`maxToolDurationMs` 是摘要链的总超时上限，供 agent 侧桥接设定 HTTP 等待时间，#2652）。
- **关闭时的语义**：会话模型的 summary 就是权威摘要 —— 内核把它直接写成 block 内容（`kernel/src/compress.ts` 的 compress 路径）。**⇒ taskline 自己生成的 summary 在默认配置下就是权威摘要。**
- 另外：`conversationPromptSections(sections, external)`（`src/external-summary-surface.ts:24-26`）在外部摘要模式下会**丢掉 `howToCompress` 段**（≈1.5k token），因为写摘要的规则改为发给独立摘要服务。

### 2.9 `compressibleRanges` 的坐标

- **类型**（`kernel/src/types.ts:675-700`）：

  ```ts
  interface CompressibleRange {
    startRef: string; endRef: string; count: number; tokens: number;
    chars?: number;            // 推荐侧门限要用 chars，不能用 tokens*4
    toolPct: number; textPct: number;
    dangerous?: boolean; userMsgs?: number;
    // …还有按位置排序用的 index（ref 号序 ≠ 数组序）
  }
  ```
- **ref 形态**（`kernel/src/refs.ts:6-32`）：`indexToRef` → `m` + 5 位零填充（`m00001`），上限 9,999,999；`BLOCKED_REF = "BLOCKED"` 是「有 rawId 但无数字 ref」的哨兵。
- **暴露**：`src/plugin.ts:2364` — status 响应里 `compressibleRanges: nudge?.compressibleRanges ?? null`（不可计算时为 `null`）。status 还会先 `excludeDeadRefRanges` 掉「已被客户端改写/删除」的 ref 区间（`src/plugin.ts:2214-2216`）。
- **⇒ 坐标是 bili 的 ref 空间**。taskline 若用 DSH 的 seq / message id 表达任务区间，必须先经 §2.13 的桥换成 `mNNNNN`。

### 2.10 `biliMsgIds` / `biliLedgerSeqs` 的 pin 规则

**字段名**（`src/msgid-pin.ts:13`、`:21`）：`biliMsgIds`（消息 id 数组）、`biliLedgerSeqs`（服务端 ledger 序号数组）。

**严格校验**（`src/msgid-pin.ts:28-41` `validateMsgIds`）—— **全有全无**：

| 条件 | 违反时的 reason |
|---|---|
| 必须是数组 | `not-an-array` |
| 长度 **必须 == 消息数** | `length-mismatch` |
| 每项是非空字符串、长度 ≤ 512 | `bad-entry` |
| 不以 `acp_summary_` 开头（内核合成锚点命名空间） | `reserved-prefix` |
| 不含空白 / 控制字符 | `control-or-space` |
| 数组内无重复 | `duplicate` |

**任一条违反 ⇒ 整批拒绝**（`src/server/prepare-anthropic.ts:261`：`log('warn', 'pin rejected (reason) — falling back to content-derived ids')`），退回内容派生 id。

**seqs**（`src/msgid-pin.ts:111-118` `validateMsgSeqs`）：长度同样必须 == 消息数；每项是 ≥1 的安全整数；**刻意允许非单调、不连续**（分支指针会挑任意子集）。

**落点**：`src/msgid-pin.ts:43-45` `applyMsgIdPin`（覆写 `m.id`）、`:120-122` `applyMsgSeqStamps`（写 `m.ledgerSeq`）。

**两个关键前提**：

1. **只有 pluginMode 才 pin**：`src/server/prepare-anthropic.ts:247` 的 `if (pluginMode && (incomingMsgIds !== undefined || incomingMsgSeqs !== undefined))` —— `pluginMode` 来自请求头 `x-bili-plugin`。**不经过代理的请求根本没有 pin 这条路。**
2. **rollout 开关**（`src/rollout.ts:104`）：`pluginLaneServerHistory: { percent: 100 }` —— 2026-11-13 owner ruling 已 GA 默认开；关闭时字段被**剥离**、不 pin（`src/server/prepare-anthropic.ts:292`）。相邻的 `pluginMsgIdIncremental: { percent: 100 }`（`:116`）也是默认开。

**出站前剥离**（`src/server.ts:3126-3150`）：`biliMsgIds` / `biliLedgerSeqs` 只进代理的账本，**绝不转发给上游模型**。

### 2.11 DSH message id → bili ref 的完整链路

```
DSH Session 事件
  └─ session.deriveMessages()                      packages/core/session/src/index.ts:778-800
       └─ Message{id: MessageId, role, content, …}   packages/llm/llm/src/message.ts:163-173
            └─ agent-loop 构造请求                    packages/core/agent-loop/src/agent.ts:720-735
                 messages: session.deriveMessages()
                 sessionId: this.session.id
                 └─ llm/stream waterfall              packages/llm/llm/src/index.ts:78
                      └─ bili 的 dsh-native 监听      src/agent/dsh-native.ts:2200-2230
                           ├─ hostMsgIdsOf(options.messages)   :1284-1304   ← 全有全无
                           ├─ dispatchScope = {sid, msgIds, messages, purpose}
                           └─ beforeSend → resolveEnvelopeMsgIds(body, hostMessages)  :1377-1405
                                └─ lockstep 指纹配对 (pi-msgids.ts) + core 对齐证明
                                     └─ body 字段 biliMsgIds = ENVELOPE_MSG_IDS_FIELD   :1409
                                          └─ 代理 prepare-*: pluginMode && rollout 开 ⇒ applyMsgIdPin
                                               └─ 内核 assignRefs: 未保护 ⇒ m00001/m00002…
```

**哪些消息没有 id / 被排除**：

| 情况 | 后果 | 证据 |
|---|---|---|
| 一次性 user 输入 | `RequestUserInput.id?: never` ⇒ **无 id** | `packages/llm/llm/src/types.ts:531-537` |
| 任一消息无 id | `hostMsgIdsOf` **全有全无** ⇒ 整批 undefined ⇒ 本轮不发 `biliMsgIds` | `src/agent/dsh-native.ts:1284-1304`（注释明写 "All-or-nothing per dispatch"） |
| system / developer 消息 | 在 `resolveEnvelopeMsgIds` 里被**排除**（走 hoisted 的 system 槽，不与 wire 元素 1:1 对齐） | `src/agent/dsh-native.ts:1391-1393` |
| google wire | 不支持（`resolveEnvelopeMsgIds` 只处理 openai / anthropic / responses） | `src/agent/dsh-native.ts:1379` |
| 配对不可证 | 返回 undefined ⇒ 退化 | `src/agent/dsh-native.ts:1398-1400` |

**pin 失败时的退化与断点检测**：

- 退化 = **内容派生 id**。ref 仍是 `mNNNNN`，但它对应的是「内容摘要」而不是宿主 message id ⇒ **宿主 id ↔ ref 的对应关系静默消失**。
- **没有专门的断点检测接口**。可用的间接信号：
  1. 代理侧日志 `pin rejected (<reason>) — falling back to content-derived ids`（`src/server/prepare-anthropic.ts:261`）；
  2. 客户端侧：`snapshot.orderedMessages[].rawId` 是否等于客户端自己知道的宿主 message id —— 不等 ⇒ pin 没生效；
  3. `x-bili-msgid-mode` 响应头（`src/msgid-pin.ts:99-104`，值 `incremental` / `full`）—— `full` 表示本轮退回全量形态，但**不直接表示 pin 失败**。

### 2.12 conversationId 与 DSH `session.id`

**恒等**，链路上没有任何改写：

| 环节 | 值 | 证据 |
|---|---|---|
| bili 取 sid | `llm/stream` 的 `options.sessionId`，回落 `ctx.agents.currentInitiator()?.session?.id` | `src/agent/dsh-native.ts:2100-2120` |
| 盖章 | `x-bili-plugin-conversation: <sid>` | `src/agent/dsh-native.ts:2716-2738` |
| DSH 侧来源 | `sessionId: this.session.id` | `packages/core/agent-loop/src/agent.ts:730` |
| `Session.id` | `this.header.id` | `packages/core/session/src/index.ts:329-331` |

**id 的形态**：

- web / desktop 新会话：`session-${randomUUID()}` —— `packages/api/session-controller/src/agent.ts:433-435`（`createMinted`）。
- 低层 `SessionStore.prepare()` 不给 id 时：`session-${++counter}`（`packages/core/session/src/index.ts:915-920`）—— ⚠️ 计数 id **跨进程重启会重复**。

**fork / resume**：

| 动作 | session.id | 证据 |
|---|---|---|
| **resume** | **不变**（`createSession(request)` → `claim(named, request)` → 复用同名会话） | `packages/api/session-controller/src/agent.ts:230-234` |
| **fork** | **变**（`Session.fork()` 用新 id，`meta.isSeeded = true`，并携带 `parentSession`） | `packages/core/session/src/index.ts:1149-1169` |
| bili 侧兜底 | fork 子会话在首个请求前通过 `/__bili/plugin/fork` 采纳父状态 | `src/agent/dsh-native.ts` `maybeForkAdoptBeforeSend` + `src/agent/fork-adopt.ts` |

⚠️ bili 源码注释 `src/plugin.ts:165` 写「dsh mints one UUID per session, ids never recycle」—— 在 web/desktop 的 `createMinted` 路径上成立；若走低层 `session-<n>` 计数 id，则**跨重启会 recycle**，proxy 侧可能把新会话认成旧会话。

### 2.13 snapshot 的 `rawId` 是否等于宿主 message id

**是（但以 pin 成功为前提）**。

- **代码**（`src/plugin.ts:1545-1595` `forkSnapshot`）：

  ```ts
  orderedMessages: [{ rawId: m.id, ref: ref === BLOCKED_REF ? null : ref, identityHash: … }]
  messages:        [{ rawId: m.id, ref, role, text, toolName, toolCallId, contentType, toolIsError }]
  ```

  `m.id` 就是内核消息的 raw id —— 在 host-pinned 会话里，这个 id 正是 `biliMsgIds` pin 上去的**宿主 message id**（`applyMsgIdPin` 覆写了 `m.id`）。
- **文档**（`docs/plugin-protocol.md` §8）：「On a parent whose kernel ids are the host's own stable message ids (a pinned session, where snapshot `rawId` IS the host id)」。
- **fork 的 msgid 轨**（`src/plugin.ts:1878-1885` 附近）：客户端可另附 `prefixMsgIds` + `driftFrom`；**服务端只在「每一项都等于 parent 的 `rawId`」时才接受字节漂移的前缀** —— 这条逻辑反过来证明了「host-pinned 时 `rawId` == 宿主 id」。

**⇒ 桥接结论**：`DSH MessageBase.id` ↔ `snapshot.orderedMessages[].rawId` ↔（`biliMsgIds` pin 成功时）内核 `m.id` ⇒ **ref ↔ 宿主 message id 可映射**，条件是 pin 成功且该轮没有 id-less 消息。

### 2.14 `protectedTools` 导致的 `ref:null`

- **配置**：`src/config.ts:439` — `compress.protectedTools?: string[]`（「保护工具名，永不被压缩」，全部实例）；`src/compress-settings.ts:95, 266, 434` — 配置键解析与级联。
- **内建永保护**：`kernel/src/protected.ts:11` — `ALWAYS_PROTECTED_TOOLS = ["compress", "acp_rule"]`。
- **效果**：`kernel/src/refs.ts:118-126` — `assignRefs` 对 protected 消息写 `map.byRaw[message.id] = BLOCKED_REF`，**不发数字 ref**（`byRef` 里也没有）。
- **对外**：`src/plugin.ts:1583` — snapshot 里 `ref: ref === BLOCKED_REF ? null : ref`。
- **语义**（`docs/plugin-protocol.md` §8）：「A message the kernel hard-excludes from compression (`compress.protectedTools`) carries `"ref": null` in both arrays — it participates in ordering and identity but has no addressable ref; copy it verbatim like any other prefix entry. Only `mNNNNN` strings or `null` are legal ref values.」
- **对 taskline 的含义**：被保护的区间**永远不可折叠、不可寻址**。若 taskline 的区间映射把 `ref:null` 的条目当成「未知/丢失」，会在压缩边界上造出洞。**必须逐字保留 `null`。**

### 2.15 一次 `compress` 能否提交多个不连续区间；被拒形态

**能**。`content` 一个字符串里可以放多段 `mNNNNN–mNNNNN` 头行 + 各自摘要；内核逐条建 block（`kernel/src/compress.ts` 的 compress 路径），**每段一条 ref 区间**。协议文档反复强调「Batch multiple ranges into ONE call — do not split into one call per range」（`kernel/src/compress-tools.ts:104-106`）。

**被拒形态**（`src/plugin.ts:2688-2712`、`src/proxy-tool-result.ts`）：

| 情形 | HTTP | body |
|---|---|---|
| 成功 | 200 | `{ok:true, tool, conversationId, outcome:"applied"|"partial"|"refused", blocksCreated, result}` |
| 拒绝（区间不合法 / 覆盖不了 / 无净收益） | **仍是 200** | `ok:true` + `outcome:"refused"` + `result` 里是拒绝回执文本 |
| 部分折叠 | 200 | `outcome:"partial"` + `blocksCreated`；`partialOutcomeNote` 追加一行提示（`src/proxy-tool-result.ts`） |
| 未知工具 | 400 | `{ok:false, error:"unknown tool \"X\" (expected one of: …)"}` |
| 未知会话 | 404 | `{ok:false, error:"unknown plugin conversation (…)"}` |
| 修订号过期 | 409 | `{ok:false, code:"PARENT_REVISION_CONFLICT"}` / `{ok:false, code:"TOOL_CONVERSATION_CONFLICT", …}` |
| 执行抛错 | 500 | `{ok:false, error:"…"}` |

⚠️ **`ok` 只表示「传输 + 执行成功」**；业务结果看 `outcome`。拒绝**不是** 4xx —— 客户端必须读 `outcome`，不能只看 HTTP 状态。

### 2.16 装配：隔离 profile 里怎么装 bili

**路径 A：作为 profile 的 bundle（长期方案）**

1. `~/.dsh/profiles/<name>/package.json` 的 `dependencies` 加 `"billion-context": "0.1.216"`；
2. 同一文件 `dsh.profile.bundles` 数组加 **`"billion-context"`**（**裸包名**，不是 `@deepseek-ai/...`）；
3. `pnpm install` 后，profile 的 `node_modules/billion-context` 就位；loader 从这里解析 patch 里的 `name: billion-context` 与 `name: billion-context/dsh-compaction-gate`（后者是包 `exports` 里的子路径，见 `package.json` 的 `exports` 段 `./dsh-compaction-gate`）。

**路径 B：不装包，用 `bili dsh` 启动器**

- `src/launcher.ts:3630-3656` — `writeDshAcpPatch(dshHome, entryName?)` 写 `$DSH_HOME-bili/.bili-acp.patch.yml`，内容与包内 `dsh.bundle.patch.yml` **同构**（同样 insert 两个 entry、`compaction-basic: auto:false`、`command-compact: disabled:true`、四个 preset 的 inject、llm-deepseek 重试码）；
- `src/launcher.ts:7485` — `dshArgsWithPatch(args, patchFile)` 把 `--patch <file>` 插进 dsh 的 flag 命名空间；
- `src/launcher.ts:7450-7456` — **`dshNativeInstalled()` 检测**：若目标 profile 已装 billion-context，**跳过 overlay**（否则会 insert 第二个 `bili-native`，cordis 的重复 entry id 检查会**硬失败启动**）；反之挂 overlay 并提示「本 profile 未装 bili，压缩只对本次会话生效」。

⇒ **A 与 B 只能二选一。**

**代理怎么起 / 端口**：

- bili-native 自己 spawn：`ensureProxyRunning`（`src/launcher.ts:5710+`）—— **临时端口**（port 0）+ **父 pid 看门狗**（本进程退出即杀代理）；或 attach 到已在跑的代理（按 pid / 实例文件发现）。
- 独立起代理：`bili start --port 9000 --host 127.0.0.1`（`src/cli.ts:1-20` 的 usage；默认端口常量 `ZONE_PORT_BASE = 18787`，`src/config.ts:3013`）。
- launcher 形态下：`env.BILLION_CONTEXT_PROXY = origin`（`src/launcher.ts:7392`）+ 可能 `env.DSH_HOME = <overlay home>`（`:7414-7415`）+ `HTTPS_PROXY` / `SSL_CERT_FILE` / `NODE_EXTRA_CA_CERTS`（cert-MITM）。

### 2.17 desktop 未装的现状与自禁用策略

**现状**：desktop profile 的 `dependencies` 与 `dsh.profile.bundles` 都没有 `billion-context` ⇒ 没有任何 bili entry ⇒ **DSH 原生压缩（preset 内那一份）完整武装**；同时 `bili dsh` 走 overlay 路径（会话级压缩），并会打印「本 profile 不装 billion-context」。

**自禁用策略**（协议文档 Obligations #4，`docs/plugin-protocol.md` 末节）：

> "Self-disable when not running behind bili (e.g. the agent's baseURL does not point at the proxy) — same convention as billion-context-pi / opencode-acp extensions."

对 taskline 而言，这意味着**taskline 侧**的规则：

1. **能力探测而非存在性探测**：判断「模型流量是否经过 bili 代理」而不是「包是否安装」。可用的信号：`BILLION_CONTEXT_PROXY` / `BILLION_CONTEXT_ATTACH` env、`/__bili/health` 探活、`/__bili/plugin/manifest` 的 `ok:true` + `proxy:"billion-context"`。
2. **origin 三条路要一起写**（详见 §③ 的适配结论）：
   - env `BILLION_CONTEXT_PROXY`（仅 launcher 形态可见）；
   - **不要指望 `/bili/origin`**（对第三方插件是断的，见 §③）；
   - 自己 spawn / 自己记住 origin（最稳）。
3. **缺席时的降级语义要写清楚**：bili 的降级是「**模型流量直连、完全不压缩**」，不是「压缩失败」（`src/agent/dsh-native.ts` 的 give-up 路径，`dispatchMode` 三态 `proxy` / `direct` / `refused`，`src/agent/native-intercept.ts:1590-1600`）。taskline 不应把它当成错误。
4. **不与 bili-native 抢工具名**：`compress` / `decompress` / `search_context` / `acp_status` / `acp_cache` 是 manifest 固定的名字，DSH 的 `tools.register` 对同名会抛 "already registered"（`packages/core/tools/src/index.ts:69-70`）。bili 侧靠 `restoreTools` 的「已存在就采纳」化解（`src/agent/dsh-native.ts:1013-1020`）；**第三方插件必须自己处理这个冲突**。

### 2.18 可复用调用样例

前提：代理在本机回环（`ORIGIN` 指向 bili 代理端口，不是 DSH 端口）；`CID` 是 DSH 的 `session.id`（形如 `session-<uuid>`）。

```bash
ORIGIN=http://127.0.0.1:18787
CID=session-1f2e3d4c-0000-4000-8000-abcdef012345

# ① status：看有效上下文、已折叠区块、当前可压缩区间
#    主机名必须是回环名（127.0.0.1 / localhost / ::1），Node/curl 默认就满足
curl -s "$ORIGIN/__bili/plugin/status?conversationId=$CID"
# → {ok:true, conversationId, sessionId, sessionRevision, contextTokens,
#    contextTokensSource, contextTokensAt, contextGeneration, contextLimit,
#    model, inputTokens, outputTokens, cachedTokens, requests,
#    blocks:[{id,tier,active}], compressibleRanges:[{startRef,endRef,count,tokens,chars,…}], panel}

# ② snapshot：拿有序身份 + ref（fork 协议 v2 的输入；ref:null = 被 protectedTools 保护）
curl -s "$ORIGIN/__bili/plugin/snapshot?conversationId=$CID"
# → {ok:true, protocolVersion:2, status:"exact", conversationId, sessionId,
#    parentRevision, orderHash,
#    orderedMessages:[{rawId,ref,identityHash}],
#    messages:[{rawId,ref,role,text,toolName,toolCallId,contentType,toolIsError}]}

# ③ compress：一次提交多个不连续区间（每段头行 + 各自摘要）
curl -s -X POST "$ORIGIN/__bili/plugin/tool" \
  -H 'content-type: application/json' \
  -d "$(cat <<JSON
{ "conversationId": "$CID",
  "tool": "compress",
  "nativeCaller": true,
  "expectedRevision": "<②的 parentRevision>",
  "args": { "content": "m00001–m00042 需求澄清\n## 摘要\n……\nm00120–m00135 工具契约\n## 摘要\n……" } }
JSON
)"
# → 200 {ok:true, tool:"compress", conversationId, outcome:"applied"|"partial"|"refused",
#         blocksCreated:N, result:"[Compressed m00001–m00042 → 1 block(s), ~1742 tokens saved.]"}
```

TS 片段（第三方 DSH 插件内，Node fetch，无需额外凭据）：

```ts
const ORIGIN = process.env.BILLION_CONTEXT_PROXY ?? 'http://127.0.0.1:18787'
const cid = sessionId // DSH Session.id

// 1) status
const status = await (await fetch(`${ORIGIN}/__bili/plugin/status?conversationId=${cid}`)).json()

// 2) snapshot —— rawId 在 pin 成功时 == 宿主 message id；ref 为 null 表示被 protectedTools 保护
const snap = await (await fetch(`${ORIGIN}/__bili/plugin/snapshot?conversationId=${cid}`)).json()

// 3) compress —— 多个不连续区间一次提交
const ranges = [
  { start: 'm00001', end: 'm00042', summary: '## 摘要\n……' },
  { start: 'm00120', end: 'm00135', summary: '## 摘要\n……' },
]
const content = ranges.map(r => `${r.start}–${r.end} 主题\n${r.summary}`).join('\n')

const res = await (await fetch(`${ORIGIN}/__bili/plugin/tool`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    conversationId: cid,
    tool: 'compress',
    nativeCaller: true,
    expectedRevision: snap.parentRevision, // 409 PARENT_REVISION_CONFLICT 时重新取快照
    args: { content },
  }),
})).json()

// outcome 才是业务结果：ok 只表示传输+执行成功
if (res.outcome !== 'applied') console.warn(res.outcome, res.result)
```

---

## ③ 不一致与真实机制

### 3.1 bili 官方文档与 0.1.216 代码的不一致

| 项 | 文档（`docs/plugin-protocol.md`） | 代码（0.1.216） | 影响 |
|---|---|---|---|
| manifest 顶层 `protocolVersion` | 示例写 `"protocolVersion": 2`，正文首行也称 "protocol v2" | `src/plugin.ts:171` `const PLUGIN_PROTOCOL_VERSION = 1;`，`:1173` 原样返回 | **manifest 实际是 1**。文档里的 "2" 指 **fork 协议**（`capabilities.fork.protocolVersion: 2`）。第三方插件若按文档判 `protocolVersion === 2` 会误判 |
| manifest `version` 示例 | `"0.1.42"` | `VERSION`（0.1.216） | 文档示例陈旧 |
| `snapshot` 上限 | 「`BILI_PUBLIC_SNAPSHOT_CAP_BYTES`, default 16 MiB」 | `src/knobs.ts` `publicSnapshotCapBytes`（本报告未逐字核对默认值，**需实测**） | 与旧版报告的「100 MiB / `plugin.snapshotCapBytes`」是**两个不同的数**，新文档口径与旧报告不一致 |

### 3.2 DSH 侧真实机制 vs 常见误解

| 误解 | 真实机制 | 证据 |
|---|---|---|
| 「bili 把 `compaction-basic` 设成 `disabled: true`」 | bundle 层是 `config: {auto:false}`（整键替换）。真正的 `disabled:true` 由**独立常驻 entry** `bili-compaction-gate` 在 `internal/config` 钩子里按**包名 + 结构**改写 | `dsh.bundle.patch.yml:26-28`；`src/agent/dsh-compaction-disable.ts:220-232, 316-334` |
| 「`compaction-basic: auto:false` 管住了所有 profile」 | 在 **web profile 里是空操作**（web-app bundle 已把宿主层该行 `disabled:true`，真正活着的那份在 preset 内部，patch 层按 id 命不中） | `packages/bundle/web-app/cordis.patch.yml:613-617`；`packages/bundle/web-app/presets/standard.patch.yml:79-82` |
| 「关掉 bili-native 会把会话创建砖死」 | #3662 已修：gate 是**独立常驻 entry**（`inject: []`），bili-native 被 kill-switch 时 gate 仍开闸 → preset 回落到**原生 DSH 压缩**，而不是永远 pending。**唯一危险动作是 disable `bili-compaction-gate` 本身** | `src/agent/dsh-compaction-gate.ts:1-10, 29-30`；`dsh.bundle.patch.yml:14-20` |
| 「preset 的 `inject` 是与宿主层 `inject` 合并」 | **整键替换**。bili 在 patch 注释里明写「entry inject lists are REPLACED by patches, not concatenated」 | `vendor/include/src/patch.ts:167-170`；`dsh.bundle.patch.yml:40-42` |
| 「patch 目标行不存在会启动失败」 | 只 `warn` 并跳过 | `vendor/include/src/patch.ts:155` |
| 「`/bili/origin` 是公开的 loopback 端点」 | 它在 **DSH 的 web 端口**上，且 DSH 的 `WebRoute.auth` **默认 `required`** ⇒ 未鉴权请求 401/403；进程内 `readResource` 只服务 `resource` 路由，而 bili 挂的是 `handler` 路由 ⇒ **进程内也读不到** | `packages/host/webserver/src/index.ts:120-125, 576-590, 780-782`；`packages/client/connection/src/rpc-host.ts:87-95`；`src/agent/dsh-native.ts:2170-2183` |
| 「bili 的 `/__bili/plugin/*` 需要凭据」 | **不需要**。loopback-only + trusted-origin，非浏览器客户端（无 `Origin` 头 + 回环 Host）直接放行 | `src/server/admin.ts:98-131, 163-170, 228-240` |
| 「压缩拒绝是 HTTP 4xx」 | 拒绝是 **200 + `outcome:"refused"`**，`ok` 只表示传输与执行成功 | `src/plugin.ts:2688-2712`；`src/proxy-tool-result.ts` |
| 「`compress` 参数应该发 JSON 数组」 | 广告形态是**一个字符串**；数组只是解析器兼容，不是广告形态 | `kernel/src/compress-tools.ts:47-110`；`docs/plugin-protocol.md` §3 |
| 「snapshot 的 `ref:null` 表示数据丢失」 | 表示**该消息被内核硬保护**（`compress.protectedTools` 或内建 `compress`/`acp_rule`），无数字 ref，但仍参与顺序与身份，**必须逐字提交** | `kernel/src/protected.ts:11`；`kernel/src/refs.ts:118-126`；`src/plugin.ts:1583`；`docs/plugin-protocol.md` §8 |
| 「DSH 会话 id 恒定不变」 | resume 不变、**fork 变**；且低层 `session-<n>` 计数 id **跨重启会 recycle** | `packages/core/session/src/index.ts:915-920, 1149-1169`；`packages/api/session-controller/src/agent.ts:230-234, 433-435` |

### 3.3 适配可行性的三个硬结论

**结论 1 —— origin 只能自己拿，`/bili/origin` 这条路对第三方插件是断的。**
`/bili/origin` 挂在 **DSH 的 web server** 上（DSH 端口），而 DSH 的路由默认 `auth: 'required'`；bili 又没有把它声明成 `anonymous`，也没有把它注册成 `resource` 路由 ⇒ 第三方插件既不能用未鉴权 HTTP 读，也不能用 `webServer.readResource` 读。可行路径只剩三条：**(a)** 读 `process.env.BILLION_CONTEXT_PROXY`（**仅 `bili dsh` 启动形态有**，`src/launcher.ts:7392`）；**(b)** 自己 spawn 代理（`bili start --port <p>` 或 `ensureProxyRunning`）并自己记住 origin；**(c)** 与 bili-native 共进程时，从它注册的服务里拿（但 bili-native 没有对外暴露 origin 服务）。

**结论 2 —— conversationId 就是 DSH `session.id`，但 ref 桥接依赖 pin 成功。**
`llm/stream` 的 `options.sessionId` = `Session.id` = `session.header.id`，bili 原样盖章成 `x-bili-plugin-conversation`。**fork 会换 id**（bili 有 fork-child adoption 兜底），**resume 不换**。DSH message id ↔ bili ref 的桥必须走 `biliMsgIds` pin；而 pin 是**全有全无**且**只对 pluginMode 生效** —— 一个 id-less 消息（`RequestUserInput`）就让整批退化。**因此「DSH message id → bili ref」不是恒等映射，而是「pin 成功时恒等、否则全体退化为内容派生 id」。**

**结论 3 —— 第三方插件不能只当「压缩 API 客户端」；它必须接管模型流量。**
bili 的会话与折叠状态**只由经过代理的模型请求喂养**（`/__bili/plugin/*` 全部作用于代理侧会话；没有任何「上传历史」的入口）。一个只调 `POST /__bili/plugin/tool` 的第三方插件会拿到 `404 unknown plugin conversation (no model request has arrived with this conversation id yet)`（`src/plugin.ts:2555-2566`）。所以第三方 DSH 插件要做 bili wire 后端，**要么**自己成为 fetch 拦截器 / 改 provider baseURL（复刻 `bili-native` 的 `native-intercept.ts` 全套：`globalThis.fetch` 包装、`/bili/<upstream>` 重写、请求头盖章、模型 URL 探测），**要么**接受「bili 只作为另一个进程的压缩服务，DSH 侧拿不到 ref」。

### 3.4 集成形态建议（bili 作为 taskline 内置压缩器之一）

| 维度 | 结论 |
|---|---|
| 形态 | **wire 级压缩器**：bili 代理持有会话与折叠状态，**不写 DSH 会话日志、不产生 DSH compaction 事务**。taskline 选区间 → 映射 ref → 调 `compress` |
| 区间坐标 | 用 `status.compressibleRanges` 的 `mNNNNN`（或 `snapshot` 的 `ref`）；**不要**用 DSH seq |
| 摘要来源 | `externalSummary` 关闭（默认）⇒ taskline 自己生成并作为权威 summary 传入；开启 ⇒ bili 的独立服务产出权威摘要，taskline 提交的 summary 只是 hint（manifest 会暴露 `capabilities.externalSummary`） |
| 工具名 | `compress` / `decompress` / `search_context` / `acp_status` / `acp_cache` 是固定名，**与 bili-native 同时在场时必然撞名**（DSH `tools.register` 同名会抛；bili 侧靠「已存在就采纳」化解） |
| 状态回读 | `status` 的 `contextTokens` / `contextTokensSource` / `contextTokensAt` / `contextGeneration` / `blocks` / `compressibleRanges`；**不要**用累计 `inputTokens` / `cachedTokens` 推断有效上下文（协议文档明写） |
| 降级 | bili 缺席 ⇒ **模型流量直连、完全不压缩**（不是错误）。taskline 需自建降级路径与提示 |
| 装配 | profile 的 `dsh.profile.bundles` 加 `billion-context`（裸包名）+ `dependencies` 钉版本；**不要**与 `bili dsh` 的 overlay 同时用（重复 entry id ⇒ 硬失败启动） |
| 顺序 | `compress` 用 `expectedRevision` = `snapshot.parentRevision`；409 时**重取快照重匹配**，不要盲目重试 |

### 3.5 对旧版结论的修订（0.2.2-alpha.3 / 0.1.205 → 0.2.3-alpha.2 / 0.1.216）

| 旧结论 | 新结论 | 变化原因 |
|---|---|---|
| 「seq ↔ ref 没有直连，不存在映射」 | **有桥**：`snapshot.rawId` 在 host-pinned 会话里就是宿主 message id；DSH `MessageBase.id` 是那个 id | 0.1.216 的 `biliMsgIds` pin 通道（rollout `pluginLaneServerHistory` 已 GA 默认开） |
| 「bili 的 compress 工具要调用方提供 summary，bili 默认不生成」 | **默认下成立**（`externalSummary` 默认关 ⇒ 调用方 summary 权威）；开启后才是 bili 生成 | 0.1.216 的 `capabilities.externalSummary` 契约 |
| 「bili 不推荐区间」 | **会推荐**：`status.compressibleRanges` | `src/plugin.ts:2364` |
| 「插件协议 v2 是完整 API」 | **端点集更全**（新增 `compact` / `render` / `turn` / `session-name` / `attribution` / `runtime-info`）；但**顶层 `protocolVersion` 实际是 1**，文档写 2 | `src/plugin.ts:171` vs `docs/plugin-protocol.md` |
| 「bundle patch 只设 `compaction-basic: auto:false`」 | **新增 `command-compact: disabled: true`**（#7154）；且 gate 机制在 0.1.216 已拆成独立常驻 entry（#3662） | `dsh.bundle.patch.yml:29-39` |
| 「bili 会推荐区间 / snapshot 上限 100 MiB」 | 上限口径需重核（新文档 16 MiB vs 旧报告 100 MiB，两个不同的旋钮） | `docs/plugin-protocol.md` §8 vs 旧报告 §2.3(d) |
| 「desktop 没装 / web 装了 0.1.205」 | **不变**（本轮复核 `~/.dsh/profiles/desktop/package.json`、`~/.dsh/profiles/web/package.json` 确认） | — |
| 「`/bili/origin` 在 DSH web 端口、curl 404」 | 端口结论不变，但**新增关键约束**：该路由默认 `auth: 'required'`，未鉴权请求拿不到，进程内 `readResource` 也拿不到 ⇒ 第三方插件不能靠它发现 origin | DSH 0.2.3 的 `WebRoute.auth` 默认值 |

---

## ④ 需实测

1. **`/bili/origin` 的实际可达性（DSH 0.2.3-alpha.2 实机）**：在**装了 bili 的 web profile** 上跑 `curl -i http://127.0.0.1:<dsh-port>/bili/origin`，确认状态码（预期 401/403，因为 `auth` 默认 required）与响应体；再带上 web 会话 cookie 复测，确认能拿到 `{origin, relay?, contextTab}`。**这决定第三方插件的 origin 发现策略。**
2. **`BILLION_CONTEXT_PROXY` 在桌面 app 进程内是否可见**：桌面 app 由 Electron 拉起 dsh，不经 `bili dsh` ⇒ 预期**不可见**。需在隔离实例里 `process.env` 打点确认。
3. **`biliMsgIds` pin 在真实 DSH 会话上的成功率**：跑一轮带工具调用的会话，抓代理日志里的 `pin rejected (...)` 与 `[msgid]` 行；用 `snapshot.orderedMessages[].rawId` 与 DSH `MessageBase.id` 逐条比对，量化「rawId == 宿主 id」的比例。**这是 ref 桥接可行性的唯一硬指标。**
4. **`session-<n>` 计数 id 在真实运行路径上是否出现**：确认 web/desktop 是否**只**走 `createMinted`（UUID）。若存在 `session-<n>` 路径，需评估跨重启 recycle 对 proxy 会话绑定的影响。
5. **`BILI_PUBLIC_SNAPSHOT_CAP_BYTES` 的实际默认值**（0.1.216）：新文档写 16 MiB，旧报告写 100 MiB（`plugin.snapshotCapBytes`）。需在 `src/knobs.ts` 里逐字确认，并实测超限时的 409 体。
6. **`externalSummary` 在隔离 profile 的默认值**：确认默认配置下 `capabilities.externalSummary` **不出现**（默认关），且此时 taskline 提交的 summary 确实成为 block 内容（用 `snapshot` + `search_context` 回读确认）。
7. **一次 `compress` 提交多个不连续区间的实际效果**：提交两段不相邻的 `mNNNNN–mMMMMM`，核对 `blocksCreated` 与 `outcome`；再用 `status.blocks` 看是否生成两个独立 block。
8. **被拒形态的实际回执**：故意提交一个被 `protectedTools` 覆盖或已被折叠的区间，观察 `outcome`（`refused`? `partial`?）与 `result` 文本的确切措辞 —— taskline 的错误提示要照抄这个形态。
9. **fork / resume 后的 conversationId 行为**：在 DSH 里做一次 fork，确认子会话的 `session.id` 变化、bili 侧 fork-child adoption 是否生效（子会话的 `snapshot` 是否带继承区块）。
10. **desktop profile 装 bili 的完整装配演练**：在隔离 profile（`DSH_HOME` + 独立端口 + `DSH_DESKTOP_NO_SINGLEINSTANCE=1`）里装 `billion-context@0.1.216` + 加 `dsh.profile.bundles`，验证：(a) 两个 entry 挂上；(b) 四个 preset 的 `inject` 闸门开合；(c) `compaction-basic` 在 `dsh --profile X --dump-config` 里的最终形态；(d) `/bili/origin` 与 `/__bili/health` 的可达性。
11. **`tools.register` 撞名行为**：在 bili-native 在场时注册同名 `compress`，确认 DSH 抛 "already registered" 的确切文案与第三方插件的规避方式（换名 / 复用 / 让路）。
12. **`compressibleRanges` 与 taskline 任务区间的坐标对齐**：比对 `status.compressibleRanges` 的 `startRef/endRef` 与 `snapshot.orderedMessages` 的下标，确认「ref 序 ≠ 数组序」（子代理交错 / 中段摘要节点会让 ref 号序与位置序不一致），据此定 taskline 的区间求交算法。

---

## ⑤ 参考来源

### billion-context 一手源码（`/Users/mutou/.cache/dsh-research/billion-context`，**0.1.216**，commit `ced22b1`）

- `dsh.bundle.patch.yml:1-66` —— 全部 patch 内容与理由注释（`bili-native` / `bili-compaction-gate` insert、`compaction-basic: auto:false`、`command-compact: disabled:true`（#7154）、四个 preset 的 `inject:[biliBasicCompactionPolicy]`、`llm-deepseek*` 的 retryPolicy 整键重写）
- `src/agent/dsh-native.ts:82-83`（`name` / `inject`）、`:204-221`（`shouldBootstrapNativeDsh` / `planNativeDsh`）、`:918-945`（`toolDefinition` → DSH `ToolDefinition` 映射）、`:1002-1030`（`restoreTools` 的撞名采纳）、`:1284-1304`（`hostMsgIdsOf` 全有全无）、`:1377-1405`（`resolveEnvelopeMsgIds`）、`:1409`（`ENVELOPE_MSG_IDS_FIELD`）、`:2076-2092`（`apply` 与 `declareDshCompactionActive`）、`:2100-2120`（`attributionOf` sid 链）、`:2170-2183`（`/bili/origin` 路由）、`:2239-2257`（webServer 注册）、`:2716-2760`（`headersFor` 盖章）
- `src/agent/dsh-compaction-gate.ts:1-47` —— 常驻 gate entry（`inject: []`、`apply`）
- `src/agent/dsh-compaction-disable.ts:64`（服务名）、`:89-103`（verdict 通道）、`:110-198`（遥测）、`:220-232`（`disableBasicCompaction`）、`:254-280`（运行时 preset 覆盖）、`:313-344`（`registerCompactionDisable`）、`:371-391`（宿主层失守告警）
- `src/agent/native-bootstrap.ts:18-61`（`nativeBootstrapGate` / `proxyEnvOrigin` / `nativeAttachOrigin`）
- `src/plugin.ts:171`（`PLUGIN_PROTOCOL_VERSION = 1`）、`:1167-1191`（manifest 构造）、`:1545-1595`（`forkSnapshot`）、`:1755-1766`（`handlePluginSnapshot`）、`:2106-2372`（`handlePluginStatus` 与响应字段）、`:2373-2712`（`handlePluginTool` 与各错误分支）、`:739-760`（pending register 语义）、`:1184-1190`（端点常量）
- `src/server/admin.ts:81-131`（hostname 归一化 / `isTrustedAdminOrigin`）、`:163-170`（`adminTrustedHostnames`）、`:228-240`（loopback + trusted-origin 门禁）、`:515-559, 949-1039`（路由表）
- `src/msgid-pin.ts:13-21, 28-45, 111-122` —— 字段名、严格校验、pin/seq 应用
- `src/server/prepare-anthropic.ts:235-300` —— pluginMode 前提、pin 流程、失败日志、rollout 剥离
- `src/rollout.ts:94-120` —— `pluginLaneServerHistory: {percent:100}`、`pluginMsgIdIncremental: {percent:100}`、注释里的 owner ruling 日期
- `src/server.ts:3126-3150` —— 出站前剥离 `biliMsgIds` / `biliLedgerSeqs`
- `src/external-summary-surface.ts:6-30` —— `EXTERNAL_SUMMARY_NOTE`、`externalSummaryEnabled`、`maxToolDurationMs`
- `src/external-summary-settings.ts:26-60` —— `ExternalSummarySettings`（默认 `enabled:false`）、`SUMMARY_DEFAULT_BUDGET`
- `src/proxy-tool-result.ts` —— `outcome` 枚举、`parseToolOutcome`、`partialOutcomeNote`
- `src/config.ts:439`（`protectedTools`）、`src/compress-settings.ts:95, 266, 434`（配置解析）
- `src/launcher.ts:3630-3656`（`writeDshAcpPatch`）、`:3690-3705`（`dshArgsWithPatch`）、`:7372-7425`（dsh 分支 env：`BILLION_CONTEXT_PROXY` / `DEEPSEEK_BASE_URL` / `DSH_HOME` overlay）、`:7449-7486`（`dshNativeInstalled` 与 overlay 决策）、`:5710+`（`ensureProxyRunning`）
- `src/cli.ts:1-20`（`bili start --port/--host` usage）、`src/config.ts:3013`（`ZONE_PORT_BASE = 18787`）
- `kernel/src/compress-tools.ts:19-110` —— 工具名常量、广告形态、`COMPRESS_PARAMETERS`、演进注释
- `kernel/src/parse-compress-input.ts:79-105, 173-297, 463-480, 490-495, 660-692` —— 解析阶梯、条目校验、分隔符白名单
- `kernel/src/refs.ts:6-32, 118-126` —— ref 形态、`BLOCKED_REF`、`assignRefs` 的保护分支
- `kernel/src/types.ts:675-700, 769-784` —— `CompressibleRange`、`NudgeDecision`
- `kernel/src/protected.ts:1-12, 36-60` —— `ALWAYS_PROTECTED_TOOLS`、失败压缩回执前缀、近期压缩交换豁免
- `docs/plugin-protocol.md` —— 协议权威文档（端点、头、tool/status/snapshot/fork 契约、Obligations #4 自禁用约定、§8 rawId/prefixMsgIds/ref:null 语义）
- `docs/session-identity.md:256-258` —— 「claude/codex/dsh need nothing here」
- `docs/identity-channels.md:32` —— stamped lane 的身份来源
- `package.json` —— `exports`（`.` / `./dsh` / `./dsh-compaction-gate` / `./client`）、`bin`（`bili` / `bili-proxy`）、version

### 已装产物（本机实证）

- `~/.dsh/profiles/web/package.json` —— `dependencies` 含 `"billion-context": "0.1.205"`；`dsh.profile.bundles` 含 `"billion-context"`；`bundles` 含 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`
- `~/.dsh/profiles/desktop/package.json` —— **无** `billion-context`（dependencies 与 bundles 均无）；bundles 含 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` ⇒ **两个 profile 的 DSH 侧结构相同**
- `~/.dsh/profiles/web/node_modules/billion-context/dsh.bundle.patch.yml` —— **0.1.205 的实际 patch**：与 0.1.216 的唯一差异 = **没有 `command-compact: disabled: true` 那一行**（#7154 是 0.1.216 新增）
- `~/.dsh/profiles/web/node_modules/billion-context/package.json` —— version `0.1.205`

### DSH 一手源码（`/Users/mutou/vault/projects/deepseek-harness`，commit `4b399c39a6`，**0.2.3-alpha.2**）

- `packages/boot/app-boot/src/profile.ts:7-12`（patch 层纪律注释）、`:54-71`（`bundlePatchFiles` / `bundlePatchPaths`）、`:75-104`（`ProfileLayer` / `Profile`）、`:755-762`（`composeEntries`）
- `vendor/include/src/patch.ts:105-181` —— `applyPatches` 全语义（insert / 目标缺失 warn / name 不匹配 warn / 整键替换 / group config 卸载）
- `vendor/loader/src/index.ts:110-135, 154` —— `internal/config` 钩子顺序、`Inject.resolve`
- `vendor/cordis/src/registry.ts:63-92` —— `Inject.resolve`（数组 ⇒ 只声明依赖名）
- `vendor/loader/src/config/entry.ts:20, 92-93, 133` —— `disabled` 语义与「disabled ⇒ 不加载」
- `packages/host/webserver/src/index.ts:88-160`（`WebRoute` / `WebAuthenticationRule`，**「Defaults to required」**）、`:515-527`（`register`）、`:576-590`（`readResource` 只服务 resource 路由）、`:608-613`（请求分发）、`:780-794`（`authPolicy` / `authorize`）
- `packages/client/connection/src/rpc-host.ts:87-95` —— `webserver/authorize` 监听器（不可信 ⇒ 403；否则走 `connection.authentication.authenticate`）
- `packages/bundle/base/cordis.patch.yml:366-372` —— 宿主层 `compaction-basic` / `command-compact`
- `packages/bundle/web-app/cordis.patch.yml:606-620` —— web-app 把宿主层 `compaction-basic` / `command-compact` / `tool-result-pruner` 置 `disabled: true`
- `packages/bundle/web-app/presets/{standard,ptc,minimal,cordis}.patch.yml` —— 四个 preset 行（`standard.patch.yml:72-86` 是 `compaction` group 内嵌的三行）
- `packages/bundle/web-app/package.json:48-58` —— `dsh.bundle.patch` 数组（1 个主 patch + 4 个 preset patch）
- `packages/compaction/compaction-basic/src/config.ts:71-72, 108` —— `auto` 必须 boolean、默认 true；`src/types.ts:49-50, 72`
- `packages/compaction/command-compact/src/index.ts:12, 103` —— `name = 'command-compact'`、`definitionId: '@deepseek-ai/dsh-command-compact'`
- `packages/llm/llm/src/message.ts:163-173` —— `MessageBase { readonly id: MessageId; content; source }`；`:176-205` 五个 role 特化；`:221` `Message = MessageRoleMap[keyof MessageRoleMap]`
- `packages/llm/llm/src/types.ts:517-537`（`ToolSchema`、`RequestUserInput.id?: never`）、`:539`（`RequestMessage`）、`:564-606`（`GenerateOptions`，含 `messages` / `sessionId` / `purpose`）
- `packages/llm/llm/src/index.ts:78`（`'llm/stream'` waterfall 契约）、`:1150-1170`（`stream` → `ctx.waterfall`）
- `packages/llm/llm/src/brand.ts:16-24` —— `MessageId` 品牌类型
- `packages/core/agent-loop/src/agent.ts:718-736` —— 请求构造（`messages: session.deriveMessages()`、`sessionId: this.session.id`）；`:480` —— `llm.stream(request)`
- `packages/core/session/src/index.ts:304-334`（`Session` 类 / `get id()`）、`:366-380`（`static create`）、`:884-949`（`SessionStore.create` / `prepare`，**`session-${++counter}` 计数 id**）、`:1149-1169`（`fork`）
- `packages/core/session/src/surface.ts:120-150` —— `deriveEventMessage`
- `packages/api/session-controller/src/agent.ts:230-234`（`createSession` → resume 同 id）、`:433-435`（`createMinted` → `session-${randomUUID()}`）
- `packages/core/tools/src/contracts.ts:26-108` —— `ToolDefinition` / `ToolOutputDefinition`（`output` 必填、`render` 返回 `ContentBlock[]`）
- `packages/core/tools/src/index.ts:64-70`（同名注册报错文案）、`:99-151`（`ToolsService.register`）

### 被审查的规格

- `gh issue view 1 --repo hyperion2144/dsh-taskline --json body -q .body` —— §4.4「bili 适配器」与 §6「错误处理」全文
- 产品决定：**bili 必须是 taskline 的内置压缩器之一**（本报告 §3.4 的集成形态建议即由此推导）
