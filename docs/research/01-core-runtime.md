# 01 — dsh-taskline-core 运行时可行性核实（基于 0.2.3-alpha.2）

> **核实对象**：GitHub issue #1（`hyperion2144/dsh-taskline`）的 §2 包结构、§3 taskline-core、§6 错误处理表。
>
> **一手来源**：DSH 源码 `/Users/mutou/vault/projects/deepseek-harness`，commit `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`，version `0.2.3-alpha.2`（2026-11-22）；内嵌 cordis `vendor/`（`vendor/include`、`vendor/loader`）；同仓新增的官方同类插件 `packages/experimental/timeline`。
>
> **本文件取代 0.2.2 版结论。** 旧版（`docs/research/01-core-runtime.md`，基于 commit `8bd073392e` / `0.2.2-alpha.3`）中关于包清单字段、`defineTool` 输出契约、Web 层 compaction 行状态、`tool.call` 呈现机制的条目已失效；本次逐条重写，旧文档只保留结构参考价值，其结论**不可信**。
>
> **核实方法**：逐条回到拥有该事实的源码；找不到就写"不存在"并给出最接近的真实机制。行号均指 `4b399c39a6`。
>
> **核实日期**：2026-11-26。

---

## ① 结论摘要表

| # | 断言（issue #1） | 判定 | 关键证据 |
|---|---|---|---|
| 1a | `dsh.manifestVersion` | **部分正确**（字段存在，**从不被读取**） | `packages/util/package-manifest/src/types.ts:34`（仅类型声明）；全仓 grep 仅命中该行与桌面脚本里同名无关函数 |
| 1b | `dsh.kind` | **不存在** | `DshManifest` 只有 `manifestVersion/bundle/profile/client`：`packages/util/package-manifest/src/types.ts:32-41` |
| 1c | `dsh.capabilities` | **不存在** | 同 1b |
| 1d | `dsh.labels` | **不存在**（在 package.json 里） | `labels/category/keywords` 属于**插件市场索引文件**：`packages/util/plugin-market-index/src/index.ts:104,115-143` |
| 1e | `dsh.bundle` = `{ patch: "./cordis.patch.yml" }` | **已核实**（且 0.2.3 起 `patch` 支持**字符串或数组**） | `packages/util/package-manifest/src/types.ts:70-78`；`packages/boot/app-boot/src/profile.ts:54-70`（`bundlePatchFiles/Paths`） |
| 1f | `dsh.client` | **已核实**（`platform/inject/immediately/external`） | `packages/util/package-manifest/src/types.ts:86-99` |
| 1g | `dsh.compatibility` | **不存在**（兼容性走 `engines.dsh` / DSH peer 依赖） | `packages/boot/app-boot/src/plugin-compatibility.ts:55-74` |
| 1h | `engines.dsh` 的位置与版本解析 | **已核实** | 位置 = `package.json → engines.dsh`（`types.ts:58-68`）；解析 = `semver.satisfies(runtime, range, { includePrerelease: true })`（`plugin-compatibility.ts:51-60`）；**有 `engines.dsh` 时忽略 peerDependencies**（`:57-61`） |
| 1i | 子包各自声明 `dsh.bundle` | **部分正确（有冗余且语义错位）** | `dsh.bundle` 的存在 = "我是 bundle"，plugin manager 据此决定是否把包写进 `dsh.profile.bundles`：`packages/boot/plugin-manager/src/operations.ts:106-122`、`packages/boot/plugin-manager/src/versions.ts:77` |
| 2a | `cordis.patch.yml` 的 `insert` 语义 | **已核实** | `vendor/include/src/patch.ts:140-152`（无 `id` → 追加到根；有 `id` → 必须是 group，插入其 `config`） |
| 2b | `disabled` 语义 | **已核实，但目标行必须已存在** | `vendor/include/src/patch.ts:154-158`（非 insert 补丁缺 `id` → warn；目标不存在 → warn **跳过**，不报错） |
| 2c | `config` 语义 | **已核实（覆盖式，非合并）** | `vendor/include/src/patch.ts:161-178`（替换目标行整块 `config`；group 的子行随之卸载再装载） |
| 2d | `compaction-basic` / `command-compact` 在 base/web-app/preset 各层的状态 | **部分正确（issue 漏掉 preset 层）** | base：**存在且启用** `packages/bundle/base/cordis.patch.yml:366-372`；web-app host 层：**已 disabled** `packages/bundle/web-app/cordis.patch.yml:613-617`；**每个 agent preset 在自己的 `compaction` group 里重新 insert 了这两行**（`isolate: { compaction: true }`）：`packages/bundle/web-app/presets/standard.patch.yml:75-83`、`minimal.patch.yml:29-33` |
| 3a | 工具注册 API | **已核实** | `ctx.tools.register(defineTool({...}))`：`packages/core/tools/src/index.ts:128`；`packages/core/tools/src/schema.ts:484-546,555` |
| 3b | 工具返回值契约 | **与 issue 心智模型不符** | `defineTool` **强制** `output: { schema, render, presentationMeta? }`，工具体返回 **canonical JSON 值**，由 `render` 投影成模型内容：`packages/core/tools/src/schema.ts:492-499`、`packages/core/tools/src/index.ts:130-135` |
| 3c | `tools/pre-execute` / `tools/post-execute` / `tools/result` 事件 | **已核实**（另有 `tools/execute`、`tools/change`） | `packages/core/tools/src/events.ts:18,29,41,49,56` |
| 3d | 能否替换 tool result content | **已核实（可以）** | `tools/post-execute` 的 `accept{content}` 直接替换内容：`packages/core/tools/src/pipeline.ts:541-545`；决策类型 `packages/core/tools/src/contracts.ts:386-389` |
| 3e | 能否追加 additionalContexts | **已核实（可以，但追加在结果之后）** | `PostToolDecision.additionalContexts`：`packages/core/tools/src/contracts.ts:387-389`；合并逻辑 `packages/core/tools/src/pipeline.ts:512,525-528`；工具体侧 `exec.deferContext()`：`contracts.ts:245-252` |
| 3f | 门禁拒绝并给出理由 | **已核实（0.2.3 起支持结构化拒绝）** | `ctx.tools.guard()`：`packages/core/tools/src/index.ts:385,394-402`；`ToolGuard` 可返回 `ToolGuardDenial{reason, info}`：`packages/core/tools/src/contracts.ts:410-418`；拒绝结果内容 = `Error: <reason>`：`packages/core/tools/src/pipeline.ts:214-226` |
| 4a | `agent/pre-step` 的 payload 范围 | **错误**（issue 的幂等前提不成立） | payload 只有**本步从 inbox 认领的消息**：`packages/core/agent/src/runtime-types.ts:351`；发起处 `packages/core/agent-loop/src/agent.ts:290,300` |
| 4b | 系统提示注入 | **已核实（但入口不是 `agent/pre-step`）** | `ctx.systemPrompt.section()`：`packages/core/system-prompt/src/index.ts:545`；`ctx.systemPrompt.context()`：`:590`；官方同类用法 `packages/experimental/timeline/src/guidance.ts:40-55` |
| 4c | 幂等与"被压缩后自动重注入" | **已核实（由 harness 保证，不需插件自实现）** | `RuntimeContextProjection.project()` 只在文本变化时产出新快照：`packages/core/agent-loop/src/runtime-context.ts:76-92`；保留快照被替换事件 shadow 后置空 → 下一步重建：`:57-66` |
| 4d | `agent.inject()` | **已核实** | `Agent.inject(message: UserMessage): void`，不唤醒 driver，下次 pre-step 认领：`packages/core/agent/src/runtime-types.ts:263-271` |
| 5a | schemastery 配置 schema + 默认值 + `Volatile` | **已核实** | `Schema.object({...}).volatile()`：`packages/experimental/timeline/src/config.ts:81-164`；`Volatile<T>` 读法 `config.ts:190-249`；cookbook `docs/cookbook/adding-a-settings-card.md:9-30` |
| 5b | `configForms.mutate` | **已核实，但它是客户端 API** | 客户端 `ctx.configForms.get<T>(ns)` → `mutate(ops, expectedRevision)`：`packages/client/ui-settings/src/client/config-form.ts:109-140`；写走 `ctx.remote.settings.mutate(ns, ops, revision)`：`:134` |
| 5c | `--dump-config` 语义 | **已核实**：打印**补丁层组合出的 entry 树**（含层次归属与逐层告警），**不是插件运行期配置值** | `apps/cli/src/dump-config.ts:32-42`；`packages/boot/app-boot/src/index.ts:648-710` |
| 5d | 校验错误给谁 | **已核实（两处不同）** | boot 期：Loader 抛 `EntryValidationError`（`vendor/loader/src/config/tree.ts:165-166`、`vendor/loader/src/config/entry.ts:229-236`）→ 该 entry 加载失败；表单期：Host 先校验，失败则**文件与活值都不变**，错误回到设置页客户端（`config-form.ts:135-137`） |
| 5e | HMR 语义 | **已核实** | `packages/boot/hmr/README.md`（源码热替换 + profile 重组合共用一条串行队列；`root: []` 时只监听显式配置）；活值更新事件 `loader/volatile-update` |
| 6a | 斜杠命令注册 API | **已核实** | `ctx.commands.register({ name, description, input?, handler })`：`packages/interaction/commands/src/index.ts:285-292` |
| 6b | 命令名是否单 token | **已核实（必须是）** | `COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u`：`packages/interaction/commands/src/index.ts:32,180-182`；解析正则 `packages/interaction/commands/src/index.ts:126` → `/taskline gate off` 的 name=`taskline`，rawInput=`gate off` |
| 6c | 命令是否可见于模型 | **已核实：默认不可见** | `CommandDefinition.handler` 语义 = "Execute against the receiving agent **without sending the command to the model**"：`packages/interaction/commands/src/index.ts:76-77`；`command/run` 只是 log-only 生命周期事件：`:373-378` |
| 7a | `appendPluginRecord` / `pluginRecordOf` 签名 | **已核实** | `appendPluginRecord(session, type, data): SessionSeq`：`packages/core/session/src/index.ts:247-253`；`pluginRecordOf(event): PluginRecord \| undefined`：`:263-267` |
| 7b | 记录类型语法 | **已核实**：`plugin:` + 斜杠分段（小写字母/数字/`.`/`_`/`-`，每段首字符为字母或数字） | `packages/core/session/src/index.ts:192`；目录侧更严（要求至少一个 `/`）：`scripts/plugin-record-catalog.ts:11` |
| 7c | seq 语义 | **已核实：是日志 seq，不是 surface seq** | `PluginRecord.seq` = `event.seq`：`packages/core/session/src/index.ts:266`；`PluginRecord` 定义 `packages/core/session/src/types.ts:560-569` |
| 7d | fork / resume 行为 | **已核实：随日志一起携带** | `packages/core/session/src/index.ts:226`（"fork and resume carry it with the rest of the log"） |
| 7e | 是否 experimental | **已核实：是** | 官方只允许 `packages/experimental/` 下的生产源码调用：`packages/core/session/src/index.ts:231-233`、`scripts/verify-plugin-record-callers.ts:39`；格式迁移只尽力保留：`:227-229` |
| 7f | `PluginRecordMap` 如何扩展 | **已核实** | `declare module '@deepseek-ai/dsh-session/types' { interface PluginRecordMap { 'plugin:taskline/tree': TaskRecord } }`；官方实例 `packages/experimental/timeline/src/records.ts:253-282` |
| 8 | §6 错误处理表逐行 | **8 行中 2 行与实现矛盾、4 行部分正确、1 行成立、1 行需插件整体自实现** | 见下文 ②8 |
| 9 | 与 0.2.2-alpha.3 的差异 | **只列影响本规格的 6 条** | 见下文 ②9 |
| 10 | `packages/experimental/timeline` 是否改变插件写法 | **已核实：是，本版新增的官方同类插件，是本规格最重要的参照物** | `packages/experimental/timeline/`（0.2.3-alpha.2 新增，0.2.2-alpha.3 中不存在）；其 `package.json` 的 `dsh` 只有 `bundle` + `client` |

---

## ② 逐条核实细节

### 1. 包清单字段（§2）

#### 1a `dsh.manifestVersion`：部分正确——字段在，但从不被读取

```ts
// packages/util/package-manifest/src/types.ts:32-41
export interface DshManifest {
  /** Manifest format version, independent of the npm package and Session format versions. */
  manifestVersion?: 1
  /** Bundle metadata consumed by the profile launcher. */
  bundle?: DshBundleManifest
  /** Profile metadata consumed by the profile launcher. */
  profile?: DshProfileManifest
  /** Client module loading and build metadata. */
  client?: DshClientManifest
}
```

全仓检索 `manifestVersion` 只命中：上面这一行声明（+ 编译产物 `lib/`），以及 `apps/desktop/scripts/prepare-dsh.ts:50` 与 `desktop-upload-plan.ts:85` 里一个**同名但无关**的本地函数（读桌面应用自身的版本号）。**没有任何 loader / plugin-manager 读它**。

→ issue 里写 `"manifestVersion": 1` 是**无害但无效**的字段。它不会被拒绝（Loader 不校验 `dsh` 段），也不会被使用。

#### 1b/1c/1d/1g `dsh.kind` / `dsh.capabilities` / `dsh.labels` / `dsh.compatibility`：全部不存在

`DshManifest` 就上面 4 个字段。

`labels` / `category` / `keywords` 确实存在，但在**插件市场索引文件**里，不是 package.json：

```ts
// packages/util/plugin-market-index/src/index.ts:115-143（节选）
function pluginMetadata(value: unknown, path: string, index: MarketIndexMetadata): MarketPluginMetadata {
  const category = field('category', (member, at) => declaredId(member, at, index.categories))
  const keywords = field('keywords', ...) ?? []
  const labels = field('labels', ...) ?? []
  ...
}
```

→ issue 把它们塞进 `package.json.dsh` 是**无效字段**（无害，但不会有任何效果）。若要上市场，标签走市场索引文件。

#### 1e `dsh.bundle`：已核实，且 0.2.3 支持多 patch 文件

```ts
// packages/util/package-manifest/src/types.ts:70-78
export interface DshBundleManifest {
  /** Supported Node Host platform names; omission allows every operating system. */
  platforms?: string[]
  /** One patch file path, or an ordered list applied in sequence, each relative to the declaring package root. */
  patch: string | string[]
  /** Show the bundle in GUI lists before the profile enables or installs it; omission means true. */
  listedByDefault?: boolean
}
```

```ts
// packages/boot/app-boot/src/profile.ts:54-70（节选）
export function bundlePatchFiles(bundle: DshBundleManifest): string[] {
  const declared = typeof bundle.patch === 'string' ? [bundle.patch] : bundle.patch
  if (!Array.isArray(declared)) throw new Error('dsh.bundle.patch must be a file path or a list of file paths')
  return declared
}
export function bundlePatchPaths(packageDir: string, bundle: DshBundleManifest): string[] {
  return bundlePatchFiles(bundle).map(file => join(packageDir, file))
}
```

#### 1f `dsh.client`：已核实

```ts
// packages/util/package-manifest/src/types.ts:86-99
export interface DshClientManifest {
  platform: string
  inject?: string[]
  immediately?: boolean
  external?: string[]
}
```

浏览器半边的构建契约（必须产出 lazy-CJS factory 格式的 `./client` 导出）见 `docs/cookbook/adding-a-settings-card.md:56-70`。

#### 1h `engines.dsh`：已核实——位置与解析都要注意两点

```ts
// packages/util/package-manifest/src/types.ts:58-68
export interface DshEnginesManifest {
  /** Compatible DSH versions as a SemVer range, including an exact version. */
  dsh?: string
  node?: string
  npm?: string
  [engine: string]: string | undefined
}
```

```ts
// packages/boot/app-boot/src/plugin-compatibility.ts:51-74（节选）
function satisfies(runtimeVersion: string, range: string): boolean {
  return range.trim() !== '' && semver.satisfies(runtimeVersion, range, { includePrerelease: true })
}
function unmetRequirements(fields, runtimeVersion) {
  const engines = Object.hasOwn(fields, 'engines') ? objectOf(fields.engines, ...) : {}
  if (Object.hasOwn(engines, 'dsh')) {
    const range = engines.dsh
    return satisfies(runtimeVersion, range) ? {} : { 'engines.dsh': range }
  }
  // 否则才看 peerDependencies 里的 @deepseek-ai/dsh* peer
  ...
}
```

要点：
1. 位置正确：`package.json → engines.dsh`（issue 写法对）。
2. `includePrerelease: true` ⇒ `">=0.2.2-0 <0.3.0"` 覆盖 `0.2.3-alpha.2`。issue 写的范围对当前版本成立，但若要覆盖 0.2.3-alpha 系列的预发布，应写成 `">=0.2.3-alpha.0 <0.3.0"` 或直接 `">=0.2.2-0 <0.3.0"`（现状即可）。
3. **一旦声明了 `engines.dsh`，peerDependencies 里的 DSH peer 就被完全忽略**（`:57-61` 提前 return）。所以 issue 同时写 `engines.dsh` 和 `peerDependencies["@deepseek-ai/dsh"]` 是冗余但无害的。

#### 1i 子包该不该声明 `dsh.bundle`：**不该**（组合包声明，子包不声明）

`dsh.bundle` 的存在与否就是"这个包是不是一个 bundle"的判据：

```ts
// packages/boot/plugin-manager/src/versions.ts:66-79（节选）
export function versionFacts(answer, name, version): VersionFacts {
  ...
  bundle: recordOf(dsh?.bundle) !== undefined,
}
```

```ts
// packages/boot/plugin-manager/src/operations.ts:106-122（节选）
for (const name of dependencies) {
  if (beforeDeps.has(name)) continue
  const metadata = bundleManifest(name, dir, anchor)
  if (metadata?.dsh?.bundle === undefined) {
    options.onOutput?.(`dsh: warning: ${name} declares no dsh.bundle — installed as a plain dependency, not a profile layer\n`, 'stderr')
    continue
  }
  ...
  for (const file of bundlePatchPaths(resolveBundleDir('dsh', name, anchor, dir), metadata.dsh.bundle)) loadOverlayPatches('dsh', file)
  if (!bundles.includes(name)) bundles.push(name)
}
```

以及插件管理器的拒绝理由：

```ts
// packages/boot/plugin-manager/src/tools.ts:20
'not-bundle': 'The package declares no dsh.bundle and cannot be managed as a plugin; install a DSH plugin bundle instead.',
```

**正确拓扑**：
- `dsh-taskline`（组合包）= **bundle**：声明 `dsh.bundle.patch`，`cordis.patch.yml` 里 insert 四个子包的行；四个子包写成它的 `dependencies`。
- `dsh-taskline-core` / `-ui` / `-compactor` / `-compactor-bili` = **普通插件包**：被组合包 patch 的行按包名解析装载，**不需要** `dsh.bundle`，**也不需要**自己的 `cordis.patch.yml`（组合包的 patch 已经插了它们的行）。
- 若子包也声明 `dsh.bundle`，单独安装任一子包时它会变成**独立 profile 层**（自己再插一行），与组合包重复；作为传递依赖时又永远不会被加载——纯冗余，且会让"哪些包是 bundle"这件事失去意义。

### 2. `cordis.patch.yml` 的 insert / disabled / config 语义

#### 2a `insert`

```ts
// vendor/include/src/patch.ts:140-152
if (insert) {
  if (id && !target) return warn('patch insert: entry %C not found', id)
  if (target && !target.group) return warn('patch insert: entry %C is not a group', id)
  const clone = structuredClone(insert)
  if (target) {
    if (!Array.isArray(target.config)) target.config = []
    target.config.push(...clone)
  } else {
    data.push(...clone)
  }
  mount(clone, { type: 'embedded', index, key: 'insert' })
  return
}
```

- 无 `id` 的 `insert` → 追加到**根** entry 列表。
- 有 `id` 的 `insert` → 目标必须是 **group**，插入其 `config` 子列表末尾。
- `insert` 里的每一行会被 `ensureIds` 补随机 id（`patch.ts:29-41`）。**若希望后续层按 id 改这一行，必须自己写 `id`**。
- issue 里每个子包写 `- insert: [- id: dsh-taskline-<suffix> / name: dsh-taskline-<suffix>]` 语法合法；组合包写 `- insert: [四个 id/name]` 也合法。

#### 2b `disabled`

```ts
// vendor/include/src/patch.ts:154-158
if (!id) return warn('patch: id is required for non-insert patches')
if (!target) return warn('patch: entry %C not found', id)
if (name && name !== target.name) {
  return warn('patch: name mismatch for %C (expected %C, got %C), skipping', id, target.name, name)
}
```

- `disabled: true` 就是把目标行的 `disabled` 键覆盖成 `true`（`patch.ts:167-170`）。
- **目标行必须已经存在**，否则只 warn 后**静默跳过**——不会报错，但也不会生效。
- 若同时写了 `name`，`name` 必须与目标行**完全一致**，否则 warn 跳过。

#### 2c `config`

```ts
// vendor/include/src/patch.ts:161-178
// the entries of a group config the patch replaces go away with it
if ('config' in overrides && target.group && Array.isArray(target.config)) {
  unmount(target.config)
}
...
if ('config' in overrides && target.group && Array.isArray(target.config)) {
  ensureIds(target.config, id => entries.has(id))
  target.config = structuredClone(target.config)
  mount(target.config, { type: 'embedded', index, key: 'config' })
}
```

→ `config` 是**整块替换**而不是合并（base bundle 头部注释也这么说：`packages/bundle/base/cordis.patch.yml:6-7`）。这正是 issue §7 "断言 entry 齐全、compaction-basic 条件式 disabled"能用 `--dump-config` 断言的原因。

#### 2d `compaction-basic` / `command-compact` 三层状态（**issue 的关键遗漏**）

| 层 | 文件:行 | 状态 |
|---|---|---|
| base bundle（CLI/headless 基础层） | `packages/bundle/base/cordis.patch.yml:366-372` | `compaction-basic` 与 `command-compact` **存在且启用** |
| web-app host 层 | `packages/bundle/web-app/cordis.patch.yml:613-617` | **已被 `disabled: true`**（连同 `tool-result-pruner`） |
| sdk-minimal | `packages/bundle/sdk-minimal/cordis.patch.yml:64-65` | 存在（insert） |
| **agent preset 层** | `packages/bundle/web-app/presets/standard.patch.yml:75-83`、`minimal.patch.yml:29-33`、`ptc.patch.yml:79-82`、`presets/cordis.patch.yml:75-78` | **每个 preset 都在自己的 `compaction` group 里重新 insert 了 `compaction-basic` + `command-compact`**（`isolate: { compaction: true }`） |

web-app 的原文注释解释了为什么要挪到 preset：

```
# packages/bundle/web-app/cordis.patch.yml:606-612
# The token METER stays on the host plane; only the compaction backend that
# reads it moves. It owns the context-meter projection units, and that table is
# process-wide, so preset ownership would make the meter a function of which
# presets happen to be mounted rather than a per-session fact.
```

**结论（issue §2 的组合包 patch 不完整）**：issue 写

```yaml
- id: compaction-basic
  disabled: true
```

只解决**host 层**。在 Web 应用（用户实际运行的桌面版/Web GUI）里：

- host 层的 `compaction-basic` 本来就已经是 `disabled: true`；
- **真正生效的是每个 agent preset 内部那个 `compaction` group 里的 `compaction-basic`**，它带着 `isolate: { compaction: true }` 独立挂载一个 `ctx.compaction`。

→ 要让 taskline 的压缩器接管，必须**同时改 preset 层的 `compaction` group**（替换/禁用 group 内的 `compaction-basic` 与 `command-compact`），否则 taskline-compactor 与 preset 里的 `compaction-basic` 会**并存两个 `ctx.compaction` 提供者**。

另外注意 `isolate` 语义：preset 的 `compaction` group 是**隔离作用域**，它自己的 `ctx.compaction` 与 host 作用域的 `ctx.compaction` 不是同一个实例。taskline 的压缩器要进入这个 group，或者让 group 换成一个 taskline 行。

#### 2e 补丁层的应用顺序（决定 `disabled` 能不能生效）

```ts
// packages/boot/app-boot/src/profile-context.ts:75-86
export function readProfilePatches(binName, context, initialProfile?): PatchOptions[] {
  const patches = structuredClone([
    ...readBundlePatches(binName, context, initialProfile),   // ① 各 bundle 层，按 dsh.profile.bundles 顺序
    ...(initialProfile?.patches ?? loadOptionalPatches(binName, context.patchPath) ?? []),  // ② profile 自己的 cordis.patch.yml
    ...(loadOptionalPatches(binName, join(context.home, PROFILE_PATCH_FILENAME)) ?? []),    // ③ home patch
    ...context.overlayPaths.flatMap(path => loadOverlayPatches(binName, path)),              // ④ --patch 覆盖
  ])
  ...
}
```

插件 bundle 由 plugin manager **追加到 `dsh.profile.bundles` 末尾**（`operations.ts:119-121`），因此它的层排在 base/web-app 之后 —— `- id: compaction-basic / disabled: true` 在 host 层能命中已存在的行。**但**若插件 bundle 被排在 base 之前（例如用户手改 `dsh.profile.bundles`），该补丁会被静默跳过。

> 建议（对 issue 的修正）：把"禁用默认 compaction"的补丁放在**用户 profile 的 `cordis.patch.yml`**（第 ② 层，永远在所有 bundle 之后），而不是组合包自己的 bundle 层；组合包只负责 insert 自己的行。

### 3. 工具注册 API 与 `tools/*` 事件

#### 3a/3b 注册与输出契约

```ts
// packages/core/tools/src/schema.ts:484-499（节选）
export interface DefineToolOptions<S extends ParameterSchemaSpec, O extends ValueSchemaSpec> {
  readonly name: string
  readonly description: string
  readonly parameters: S
  readonly output: {
    readonly schema: O
    render(args: InferArgs<S>, value: InferValue<NoInfer<O>>): ContentBlock[]
    presentationMeta?(args: InferArgs<S>, value: InferValue<NoInfer<O>>): JsonValue
  }
  readonly execute(args, exec): Promise<...>
}
```

```ts
// packages/core/tools/src/index.ts:128-135
register(definition: ToolDefinition, options: ToolRegistrationOptions = {}): () => void {
  const name = definition.name
  const output = (definition as Partial<ToolDefinition>).output
  if (output === undefined || typeof output !== 'object'
    || typeof output.render !== 'function'
    || (output.presentationMeta !== undefined && typeof output.presentationMeta !== 'function')) {
    throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`)
  }
  ...
}
```

→ **issue §3.2 描述的"工具返回 `{ taskId, startSeq }` 加一句提示"在本版本需要改写**：工具体返回 **canonical JSON 值**（受 `output.schema` 约束，违规抛 `ToolOutputError`，`contracts.ts:328-337`），由 `render` 投影成模型可见内容。想"加一句提示"，有三种合法做法：

1. `output.render` 返回多个 `ContentBlock`（先提示后 JSON）；
2. `projectContent` / `finalizeContent` 回调改写内容（`contracts.ts:50,62`；`schema.ts:523-532`）；
3. `tools/post-execute` 整体替换 `content`。

官方同类插件的写法（可直接抄）：

```ts
// packages/experimental/timeline/src/tools.ts:14-21
const output = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { content: { type: 'string', required: true } },
  } as const,
  render: (_args: unknown, value: { content: string }) => [{ type: 'text' as const, text: value.content }],
}
```

```ts
// packages/experimental/timeline/src/tools.ts:41-45, 112-121（节选）
export function installTools(ctx: Context, config: Config, storage: TimelineStorage): void {
  ctx.effect(
    () => ctx.tools.register(defineTool({
      name: 'timeline_tree',
      description: '...',
      parameters: { action: { type: 'string', required: true, enum: ['start', 'select'] }, ... },
      output,
      async execute(args, exec) { ... },
      presentCall: args => ({ card: 'generic', title: 'Timeline task tree', kind: 'other', rawInput: args.title ?? args.id }),
    })),
    'timeline: tree tool',
  )
```

注意 `ctx.effect(...)` 包裹（否则注册不会随插件卸载而撤销）。

#### 3c/3d/3e 事件与内容替换

```ts
// packages/core/tools/src/events.ts:18,29,41,49
'tools/pre-execute'(this, exec: ToolExecution, next): Promise<PreToolDecision>
'tools/execute'(this, exec: ToolDispatchExecution, next): Promise<ToolExecutionResult>
'tools/post-execute'(this, exec: ToolExecution, result, next): Promise<PostToolDecision>
'tools/result'(this, exec, result): undefined
```

```ts
// packages/core/tools/src/contracts.ts:375-389
export type PreToolDecision =
| { kind: 'allow' }
| { kind: 'deny'; reason: string; info?: ToolErrorInfo }
| { kind: 'cancel' }
| { kind: 'ask'; reason?: string; displayReason?: { readonly en: string; ... } }

export type PostToolDecision =
| { kind: 'accept'; content?: ContentBlock[]; value?: never; additionalContexts?: UserMessage[] }
| { kind: 'accept'; value: JsonValue; content?: never; additionalContexts?: UserMessage[] }
| { kind: 'block'; feedback: ContentBlock[]; info?: ToolErrorInfo; additionalContexts?: UserMessage[] }
```

- **替换 content**：可以（`accept{content}`），实现见 `packages/core/tools/src/pipeline.ts:541-545`。
- **追加 additionalContexts**：可以，两个入口 —— 工具体侧 `exec.deferContext(userMessage)`（`contracts.ts:245-252`）与策略侧 `decision.additionalContexts`（`pipeline.ts:512,525-528`）。**追加位置在 `tool/result` 之后**（agent loop 消费见 `packages/core/agent-loop/src/agent.ts:584-590`），不是"结果前面"。→ issue §3.3 说"在 tool result 的返回值**前面**追加一段文字"，在 0.2.3 里要么用 `render`/`projectContent`/`post-execute` 改 `content`，要么用 `additionalContexts`（在后面）。
- **拒绝并给理由**：`ctx.tools.guard()` 或 `tools/pre-execute` 的 `deny` 都行；0.2.3 起 `ToolGuard` 可返回结构化身份：

```ts
// packages/core/tools/src/contracts.ts:410-418
export type ToolGuard = (execution: Readonly<ToolExecution>) => string | ToolGuardDenial | undefined
export interface ToolGuardDenial {
  readonly reason: string
  readonly info?: ToolErrorInfo
}
```

拒绝结果落盘形态（`pipeline.ts:214-226`）：`content = [{type:'text', text:'Error: <reason>'}]`、`isError: true`、`error.info` 带结构化身份。

> ⚠️ **0.2.3 相对 0.2.2 的新增**：`ToolGuardDenial` 与 `PostToolDecision` 的 `block.info` 都是本版新增（见 ②9）。issue §3.5"拒绝并说明理由"现在可以带结构化身份，比旧版好做。

### 4. `agent/pre-step`、系统提示注入与 `agent.inject()`

#### 4a `agent/pre-step` payload 的真实范围（**issue 的错误前提**）

```ts
// packages/core/agent/src/runtime-types.ts:339-351
/**
* Reject a proposed step or replace the messages that enter it. Calling
* `next()` preserves the current messages.
* @param payload.messages - messages removed from the inbox for this step.
...
*/
'agent/pre-step'(this: Scoped<Agent>, payload: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal; modelSelection: Readonly<ModelSelection> }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
```

```ts
// packages/core/agent-loop/src/agent.ts:290,300
const claimed = this.inbox.claim(target, position.turn)
...
const decision = await this.dispatch.waterfall(
  'agent/pre-step', { messages: claimed, ...position, signal, modelSelection: selection },
```

→ `payload.messages` **只有本步从 inbox 认领的消息**（本步新增的用户输入），**不含历史 surface、不含系统提示、不含工具结果**。

⇒ issue §3.4 "在 `agent/pre-step` 注入一段标识（**幂等：模型可见输入里已有标记就不重复注入**）" 的幂等前提**不成立**：`agent/pre-step` 看不到"模型可见输入"，无法据此判断是否已注入。

⇒ issue §3.3 "在 `agent/pre-step` 或工具执行钩子里监听：**模型即将执行一个 tool call**" 的时序也不对：`agent/pre-step` 发生在**模型请求之前**，此时还没有 tool call。正确的钩子是 **`tools/pre-execute`**（在真正 dispatch 之前，`pipeline.ts:191-230`）。

#### 4b 正确的系统提示注入入口

```ts
// packages/core/system-prompt/src/index.ts:545, 590
section(section: PromptSection): () => void
context(context: PromptContext): () => void
```

```ts
// packages/core/system-prompt/src/index.ts:112-124（节选）
export interface PromptContext {
  readonly name: string
  readonly order: number
  /** Static text or a provider evaluated at assembly and admission refresh. Empty text contributes nothing. */
  readonly text: string | ((context: AssembleContext) => string)
  readonly interpolate?: boolean
  /** Keep this operational context when optional runtime context is disabled. */
  readonly required?: boolean
}
```

官方同类插件写法（`section` 放**静态指令**，`context` 放**每步变化的状态**）：

```ts
// packages/experimental/timeline/src/guidance.ts:40-55（节选）
ctx.systemPrompt.section({
  name: 'timeline:planning',
  order: 120,
  text: ({ agent }) => (isWorker(agent) ? workerInstructions : instructions),
  interpolate: false,
})
ctx.systemPrompt.context({
  name: 'timeline:state',
  order: 120,
  required: true,
  interpolate: false,
  text: ({ agent, signal }) => { ... },
})
```

⇒ issue §3.4 的那段 taskline 标识应拆成：
- **静态指令**（"你处于 taskline 模式…调用 task_rename / task_complete…"）→ `ctx.systemPrompt.section()`；
- **动态状态**（当前任务名、区间、是否被压缩掉）→ `ctx.systemPrompt.context()`。

`order` 参考中央表：`SECTION_ORDERS`（`packages/core/system-prompt/src/index.ts:191-231`）与 `CONTEXT_ORDERS`（`:233-242`）。timeline 用 120 落在 `SUBAGENT_DELEGATION: 120` 附近。

#### 4c 幂等与"被压缩后重新注入"：由 harness 保证

```ts
// packages/core/agent-loop/src/runtime-context.ts:76-92（节选）
project(sections: readonly ContextSnapshotSection[]): UserMessage | undefined {
  const previous = this.retained?.sections
  if (this.retained === undefined && sections.length === 0) return
  if (previous !== undefined && deepEqualJson(previous, sections)) return
  ...
}
```

```ts
// packages/core/agent-loop/src/runtime-context.ts:57-66
ctx.on('session/event', (subject, event) => {
  if (subject !== session) return
  if (event.type === 'user/message' && isOwned(event.data)) {
    this.retained = { seq: event.seq, sections: sectionsOf(event.data) }
  } else if (this.retained
    && isReplacementSurfaceEvent(event)
    && event.sourceEventSeqs?.includes(this.retained.seq) === true) {
    this.retained = null
  }
})
```

→ 文本不变就不产出新快照（幂等）；保留快照被 compaction 的替换事件 shadow 后 `retained = null`，下一步 `project()` 会**重建**快照（"被压缩 shadow 后自动缺失时，下一步重新注入"）。**这是 `systemPrompt.context()` 的能力，插件不需要自己在 `agent/pre-step` 里做幂等。**

#### 4d `agent.inject()`

```ts
// packages/core/agent/src/runtime-types.ts:263-271
/**
* Queue model-facing context for the next pre-step without waking the
* driver. A running driver claims it at the nearest later step boundary;
* idle drivers leave it pending until follow-up or steering
* wakes them. It may miss a request whose pre-step already claimed its
* batch. Cancellation or disposal may discard pending context.
*/
inject(message: UserMessage): void
```

→ 可用于"立刻把一条 taskline 提示塞给模型"，但**不唤醒 driver**，且可能错过本步的批次；幂等仍要靠自己（或走 `systemPrompt.context()`）。

### 5. 配置：schemastery / Volatile / configForms.mutate / HMR / --dump-config

#### 5a schema 与活值

```ts
// packages/experimental/timeline/src/config.ts:81-94（节选）
export const Config: Schema<Partial<Config>, PluginConfig> = Schema.object({
  reportsEnabled: Schema.boolean()
    .default(true)
    .description('Generate new interval reports. Saved reports remain available when disabled.')
    .volatile(),
  intervalMs: Schema.number().min(MINUTE_MS).max(86400000).step(1)
    .default(defaultReportCadence.intervalMs)
    .description('...')
    .volatile(),
  ...
})
```

跨字段校验（对应 issue §3.6 的三条范围规则）由覆写 `~standard.validate` 实现：

```ts
// packages/experimental/timeline/src/config.ts:166-182（节选）
const standard = Config['~standard']
Object.defineProperty(Config, '~standard', {
  value: {
    ...standard,
    validate(value: unknown) {
      const result = standard.validate(value)
      if ('value' in result) {
        const input = result.value as PluginConfig
        const cadence = { intervalMs: input.intervalMs.get(), rollupFactors: input.rollupFactors.get() }
        if (!validReportPeriods(reportPeriods(cadence)))
          return { issues: [{ path: ['rollupFactors'], message: 'Timeline report periods must increase and stay within seven days.' }] }
      }
      return result
    },
  },
})
```

⇒ issue §3.6 的"填错返回可读的校验错误，不静默夹到合法值"是**可实现的**：schemastery 的 `.min()/.max()/.step()` 本身就报错；跨字段规则用上面的 `~standard.validate` 覆写。**不会**被静默夹取。

#### 5b `configForms.mutate` 是**客户端**服务

```ts
// packages/client/ui-settings/src/client/config-form.ts:123-140（节选）
/**
* Queue one atomic namespace mutation; see {@link ConfigForm.mutate}.
* @param ops - ordered field operations copied when queued.
* @param expectedRevision - optional fixed revision read by the domain editor.
*/
mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<boolean> {
  const ownedOps = structuredClone(ops) as SettingsPathOpView[]
  ...
  const response = await this.ctx.remote.settings.mutate(this.spec.namespace, ownedOps, revision)
  if (!response.ok) { await this.recover(generation); return false }
```

- `ctx.configForms.get<T>(namespace)` 返回一个 form，字段是 `namespace` 对应的**用户段**。
- **`namespace` = profile 里的 entry id**（不是包名）。官方实例：`TIMELINE_CONFIG_ID = 'timeline-experimental'`（`packages/experimental/timeline/src/policy.ts:2`），对应其 `cordis.patch.yml` 里的 `- id: timeline-experimental`；客户端 `ctx.configForms.get<Config>(TIMELINE_CONFIG_ID)`（`packages/experimental/timeline/src/client/index.ts:99`）。
- Host 侧对应服务是 `ctx.settings`（`SettingsForms`，`packages/settings/settings/src/index.ts:223`），"Read active plugin schemas and their live values… Forms keyed by unique profile entry ids"（`:298-300`）。

#### 5c `--dump-config` 的真实语义（**issue §5.5 的"与 dump-config 同源"是错的**）

```ts
// apps/cli/src/dump-config.ts:1-7（头部注释）
/**
* Config-dump entry for `dsh --profile <name> --dump-config`: compose the
* profile's patch layers through the include plugin's patch algorithm without
* booting or evaluating `!!js`, with one source layer per bundle, the
* profile's own patch file, and each `--patch` overlay.
*/
```

```ts
// apps/cli/src/dump-config.ts:32-42
export function runDumpConfig(profile, defaultOnly, patches, fromDefaultProfile?): void {
  const loaded = prepareProfile(profile, !defaultOnly, fromDefaultProfile)
  const layers = collectConfigDumpLayers(loaded, defaultOnly, patches)
  process.stdout.write(renderConfigDump(NAME, join(loaded.dir, PROFILE_ROOT_FILENAME), layers))
}
```

→ dump 打印的是**entry 树**（每层注释标注来源，逐层输出 warn），**不包含任何插件运行期配置值**。

⇒ issue §5.5 设置页右下角那句 "与 --dump-config 同源" **错误**：设置页写的是 **settings 命名空间**（`configForms.mutate` → Host → profile patch 的 `config` 段），而 `--dump-config` 打印的是 **entry 树**。二者共享的是"profile patch 文件"这一个落点，不是同一份数据源。

⇒ issue §7 的组合断言 "**成立**"：`--dump-config` 的输出里能看到 entry 行与 `disabled` 标记，可用于断言"entry 齐全、compaction-basic 条件式 disabled"。

#### 5d 校验错误给谁

| 场景 | 谁收到 | 形态 | 证据 |
|---|---|---|---|
| 启动时 entry 的 `config` 不符合 schema | **Loader / 宿主** | 抛 `EntryValidationError`，该 entry **加载失败**（不是静默夹取） | `vendor/loader/src/config/tree.ts:165-166`、`vendor/loader/src/config/entry.ts:229-236`（`formatIssues('invalid config', …)` 带源位置） |
| 设置页改一个非法值 | **客户端设置 UI** | Host 先校验；失败则**文件与活值都不变**，客户端 `mutate()` 返回 `false` | `packages/client/ui-settings/src/client/config-form.ts:135-137`；cookbook `docs/cookbook/adding-a-settings-card.md:40`（"Reject an invalid value and verify that neither the file nor the live value changed"） |
| 跨字段 `.check()` | **Host**（持久化前） | "these checks run on the Host before persistence and are omitted from serialized form schemas" | `docs/cookbook/adding-a-settings-card.md:30` |

⇒ issue §3.6 的"填错返回可读的校验错误"应补一句：**错误回到设置页（用户）**，插件自身不负责弹错。

#### 5e HMR 的真实语义

`packages/boot/hmr/README.md`：
- base bundle 默认启用 HMR（`root: []`，见 `packages/bundle/base/cordis.patch.yml:28-32`），headless/sdk/acp bundle 把它 disable。
- `root: []` = **只监听显式配置**；要热替换源码模块需配 `root: ["."]`。
- "Module replacements, Include refreshes and profile configuration changes share one queue."（串行）
- "Loader commits volatile-only changes in place." —— 纯 volatile 字段的改动**就地生效**，不重启插件。
- 活值更新事件：`loader/volatile-update`（插件监听它刷新自己的读数，如 `packages/experimental/timeline/src/guidance.ts:189`）。

### 6. 斜杠命令

#### 6a/6b 注册 API 与名字约束

```ts
// packages/interaction/commands/src/index.ts:32
const COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u
```

```ts
// packages/interaction/commands/src/index.ts:179-191（节选）
function normalizeDefinition(definition: CommandDefinition): RegisteredCommand {
  if (!COMMAND_NAME.test(definition.name)) {
    throw new TypeError(`command name "${definition.name}" must match ${String(COMMAND_NAME)}`)
  }
  ...
}
```

```ts
// packages/interaction/commands/src/index.ts:285-292
register(definition: CommandDefinition): () => void {
  const registered = normalizeDefinition(definition)
  return this.layers.effect(this.ctx, layer => layer.commands.insert(registered.definition.name, registered), { label: 'commands.register()' })
}
```

解析：`/^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u`（`packages/interaction/commands/src/index.ts:126`）。

⇒ `/taskline gate off` 合法：name = `taskline`（单 token），`rawInput = " gate off"`（`parseCommand` 返回 `rawInput: line.slice(match[0].length)`）。**但 `gate off` 是 rawInput，不是命令名的一部分**——若要"两个子命令"，得自己在 handler 里解析 rawInput（官方 `/timeline` 就是这么干的，`packages/experimental/timeline/src/command.ts:23-31`）。

#### 6c 命令是否可见于模型：默认不可见

```ts
// packages/interaction/commands/src/index.ts:76-77
/**
* Execute against the receiving agent without sending the command to the model.
*/
readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>
```

`command/run` / `command/done` 只是 **log-only 生命周期事件**（`:373-378`, `:457-467`），不进 surface。

⇒ issue §5.4 "放行入口只对人开放，模型无法调用——放行是 CLI 命令 `/taskline gate off`" **成立**；但要注意：命令 handler 若想让人看到结果，必须自己回文本（`CommandResult{ kind:'success'|'error', text }`），**不会**自动进模型。

### 7. 插件记录（`plugin:taskline/tree`）

#### 7a 签名

```ts
// packages/core/session/src/index.ts:247-253
export function appendPluginRecord<K extends Extract<keyof PluginRecordMap, PluginRecordType>>(
  session: Session,
  type: K,
  data: NoInfer<PluginRecordMap[K]>,
): SessionSeq {
  return commitPluginRecord(session, type, data)
}
```

```ts
// packages/core/session/src/index.ts:263-267
export function pluginRecordOf(event: SessionEvent): PluginRecord | undefined {
  const type: string = event.type
  if (event.ignorable !== true || !isPluginRecordType(type)) return undefined
  return { type, seq: event.seq, time: event.time, data: event.data }
}
```

#### 7b 类型语法

```ts
// packages/core/session/src/index.ts:192
const PLUGIN_RECORD_TYPE = /^plugin:[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/u
```

⇒ `plugin:taskline/tree` **合法**（`taskline` 与 `tree` 都是合法段）。
（目录侧更严：`scripts/plugin-record-catalog.ts:11` 要求至少一个 `/`，同样满足。）

#### 7c seq 语义

```ts
// packages/core/session/src/types.ts:560-569
export interface PluginRecord {
  readonly type: PluginRecordType
  /** The record's position in the Session log. */
  readonly seq: SessionSeq
  /** Unix epoch milliseconds at append. */
  readonly time: number
  readonly data: unknown
}
```

⇒ 记录带的是**日志 seq**（`event.seq`），**不是 surface seq**。issue §3.1 的 `startSeq`/`endSeq` 写的是"任务区间起点（**surface seq**）"——这是**另一套坐标**，两者不能混用。

> **这是一个 spec 级冲突**：issue 用 `startSeq/endSeq` 表示 surface 位置，但 DSH 的 surface 位置**不是单调数值**。见 `packages/compaction/compaction/src/types.ts:106-115`：
> > "A surface-POSITION span, not numeric seq order — after a prior replace lands a fresh high-seq summary node at an older range's position, `start` can be GREATER than `end`."
>
> ⇒ issue §3.2 `task_complete` 的 "`endAt < startSeq` ⇒ 拒绝" 这条校验规则在 DSH 的真实语义下**会误杀合法区间**。正确做法是像 `compactSurfaceRegion` 那样按 **surface 位置索引**比较（`packages/compaction/compaction-basic/src/region.ts:337-345` 用 `nodes.indexOf(start)` / `indexOf(end)`）。

#### 7d fork / resume

```ts
// packages/core/session/src/index.ts:225-229
* A reader that does not recognize the type retains and skips the record, which never
* enters the model-visible surface, and fork and resume carry it with the rest
* of the log. A Session format migration retains records on a best-effort
* basis, so a record holds plugin-owned state that its owner can lose without
* changing how the rest of the log is interpreted.
```

⇒ **fork 与 resume 都会携带** plugin record；它**永不进入模型可见 surface**（`ignorable: true`）。
⇒ **格式迁移只尽力而为**——插件拥有的状态可以丢。

#### 7e 是否 experimental：是

```ts
// packages/core/session/src/index.ts:231-233
* Only production source under `packages/experimental/` may call this
* function; the `verify-plugin-record-callers` gate rejects any other
* production caller in this repository.
```

```ts
// scripts/verify-plugin-record-callers.ts:38-39
/** Production source under this prefix may call the restricted function. */
export const EXPERIMENTAL_PREFIX = 'packages/experimental/'
```

⇒ 这条约束是 **DSH 仓库内部的生产源码门禁**（`scripts/run-gates.ts:454` 的 `plugin-record-callers` gate），**不限制仓库外的插件包运行时调用**。但它清楚地表明：这是一个**实验性 API**，官方语义是"正式发布的包应该声明自己的事件类型，而不是用 plugin record"。dsh-taskline 作为外部包可以用，但要接受"格式迁移可能丢"的风险。

#### 7f `PluginRecordMap` 如何扩展

```ts
// packages/experimental/timeline/src/records.ts:253-268（节选）
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Restore a user-selected task tree and its discussions. */
    'plugin:timeline/import': TreeRecord & { annotations: Annotation[]; ... }
    /** Save a task tree and the tool call that changed it. */
    'plugin:timeline/tree': TreeRecord
    /** Select a saved task tree for subsequent work. */
    'plugin:timeline/select': SelectionRecord
    ...
  }
}
```

⇒ dsh-taskline 照抄即可：

```ts
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:taskline/tree': TaskRecord
  }
}
```

注意：augment 的模块是 `@deepseek-ai/dsh-session/types`（**types 子路径**），不是 `@deepseek-ai/dsh-session`。目录脚本会检查这一点（`scripts/plugin-record-catalog.ts:79`）。

### 8. §6 错误处理表逐行判定

| # | 场景（issue §6） | 判定 | 依据与真实机制 |
|---|---|---|---|
| 6-1 | 压缩器不可用（bili 挂了且没有默认）→ 不落盘，保留现状，告警"压缩器不可用" | **部分正确** | `ctx.compaction` 是 **Cordis Service 单实例**（`CompactionEngine extends Service`，`super(ctx,'compaction')`，`packages/compaction/compaction/src/index.ts:119-122`；文档原文 "Load one implementation per context as `ctx.compaction`"）。因此"bili 挂了 → 默认 LLM 压缩器自动生效"**不是** DSH 的服务替换语义，而是**插件自己实现的降级逻辑**（issue §4.4 第 5 点），DSH 侧无此机制。"告警"也是插件自己的行为。 |
| 6-2 | 映射失败（多模态 409 / 超 16 MiB）→ 不落盘，保留 wire 级压缩，告警带 conversationId 和 ref | **部分正确** | 完全属于 bili 插件内部；DSH 侧可对齐的只有**错误分类**：手动压缩的失败被归为 `busy/cancelled/changed/summary/commit/persistence` 六类（`packages/compaction/compaction/src/index.ts:48-63`；映射见 `packages/compaction/command-compact/src/index.ts:25-57`）。plugin 可以照此设计自己的错误码。 |
| 6-3 | 并发 compress → 串行队列，一次只处理一个落盘事务 | **部分正确（实为"锁 + 拒绝"，不是队列）** | `assertCompactionInactive` 在发现未配对的 `compaction/start` 时抛 `ManualCompactionError('busy', 'compaction: compaction already in progress; the session compaction lock is already active')`（`packages/compaction/compaction-basic/src/region.ts:309-321`）。**第二次请求被拒绝，而不是排队等待**。要"串行队列"必须插件自建。 |
| 6-4 | 同一 (startRef, endRef, summary hash) 重复 compress 幂等去重 | **依赖不存在的 API** | DSH 每次压缩生成**新的** `compactionId`（`region.ts:205` `brandString(randomUUID())`），并追加新事务；**没有**任何按 hash / (start,end) 去重的机制。必须插件自实现（且要自己定义 hash 口径）。 |
| 6-5 | 会话重启 → 从 plugin record 重建任务列表 | **已核实可行** | plugin record 随日志持久化，`pluginRecordOf` 读回；fork/resume 同样携带（`packages/core/session/src/index.ts:226`）。但它是**实验性**的，格式迁移只尽力保留（`:227-229`）。⇒ spec 应加一句"重建失败时降级为空列表"。 |
| 6-6 | bili 有块但 DSH 无事务 → 列差异清单，不自动补写 | **部分正确** | DSH 侧**有**"未配对 `compaction/start`"的检测原语（`inspectCompactionEntryState`，`region.ts:572-606`），但没有"差异清单"这一既有产物，也没有启动自检（见 6-7）。bili 的"块"是插件私有的。⇒ 整行需插件自实现。 |
| 6-7 | 压缩到一半崩溃 → 三事件要么齐全要么一个不写；孤儿 `compaction/start` 在启动自检中给出可读提示 | **与实现矛盾（两处）** | ① 失败路径写的是 **`compaction/start` + `compaction/end(error)`**，**没有** `compaction/summary`——即"两个事件、缺一个"，不是"要么齐全要么一个不写"。注释原文（`region.ts:162-164`）："Every later failure makes exactly one `compaction/end` attempt; a failed close deliberately leaves the unmatched start detectable." ② 孤儿 start **不是"启动自检"**读的：它在**下一次压缩尝试**时被 `assertCompactionInactive` 捕获并抛 busy（`region.ts:186-190,309-321`）。DSH 没有针对孤儿 start 的启动诊断（`packages/boot/app-boot/src/startup-diagnostics.ts` 只覆盖插件/服务装配状态）。 |
| 6-8 | open task 覆盖 token 超阈值 → pre-step 注入提醒（与 bili nudge 合流，10 分钟冷却） | **部分正确** | "注入提醒"可做，但入口应是 `ctx.systemPrompt.context()`（或 `agent.inject()`），**不是** `agent/pre-step`（看不到模型可见输入，见 4a）。幂等由 harness 的 `RuntimeContextProjection` 保证（`packages/core/agent-loop/src/runtime-context.ts:76-92`）。"与 bili nudge 合流、10 分钟冷却"DSH **没有**任何 nudge/冷却机制——必须插件自实现。 |

**§6 汇总**：8 行中 **2 行与实现矛盾**（6-4、6-7）、**4 行部分正确**（6-1、6-2、6-3、6-8）、**1 行成立**（6-5）、1 行（6-6）需插件整体自实现。

### 9. 与 0.2.2-alpha.3 的差异（只列影响本规格的）

对比基线：`git diff dsh-v0.2.2-alpha.3 dsh-v0.2.3-alpha.2`。

| # | 差异 | 对本规格的影响 |
|---|---|---|
| D1 | **新增 `packages/experimental/timeline`**（0.2.2-alpha.3 中不存在，4646 行 host 源码 + 大量 client 源码 + 18 个测试文件） | **最大变量**。它是官方在 0.2.3-alpha.2 里落地的"同题作文"：任务树 / 进度条 / 定时报告 / 侧栏 / 工具卡 / 提示注入 / 插件记录 / 斜杠命令 / 设置页，**正好覆盖 issue §3.3、§3.4、§5.1、§5.2、§5.3、§5.5**。dsh-taskline 应当把它当作**首选参照物**逐项对照，而不是照 0.2.2 的 API 想象写。 |
| D2 | `packages/core/tools/src/contracts.ts`：新增 `ToolContextUnavailableError`（`:310-324`）；`PostToolDecision` 的 `block` 增加 `info?: ToolErrorInfo`（`:389`）；`ToolGuard` 可返回 `ToolGuardDenial{reason, info}`（`:410-418`） | 门禁拒绝现在能带**结构化错误身份**——issue §3.5 的"拒绝并说明理由（含具体 ref 落在哪个 task）"更容易实现，且落盘信息可被 UI 结构化读取。 |
| D3 | `packages/core/session/src/index.ts` 拆分出 `validation.ts`、导出 `SessionForkError` / `buildSessionHeader` / `validateSessionLog`；新增 `SessionEventInput` | `appendPluginRecord` / `pluginRecordOf` 的**签名与语义未变**（`packages/core/session/src/index.ts:247-267`）。issue §3.1 的记录机制不受影响。 |
| D4 | `packages/compaction/compaction/src/index.ts`：`CommandId` 导入从 `@deepseek-ai/dsh-commands/brand` 改为 `@deepseek-ai/dsh-commands/types`；`compactRegion` 文档明确 "surface position span … `start` can be GREATER than `end`" | 印证 7c 的结论：issue 的 `endAt < startSeq` 校验与 DSH 语义冲突。外部插件若 import `CommandId` 要用新路径。 |
| D5 | `packages/core/tools/src/index.ts:130-135`：`register` 现在**强制** `output{schema, render, presentationMeta?}`；`packages/core/tools/src/schema.ts` 的 `DefineToolOptions` 同样是本版形态 | **注意：这不是 0.2.3 的新增**——`schema.ts` 在 0.2.2-alpha.3 已如此（旧文档 §3b 的结论仍成立）。此处只是再次确认 issue §3.2 的"工具直接返回内容"心智模型需要改写。 |
| D6 | `packages/util/package-manifest/src/types.ts` **完全未变**；`packages/bundle/base/cordis.patch.yml` 与 `packages/bundle/web-app/cordis.patch.yml` 中 `compaction-basic`/`command-compact` 的**层状态也未变**（base 启用、web-app 已 disable、preset 各自 insert） | issue §2 的包清单字段判定与 2d 的三层结论，**相对 0.2.2 旧文档没有变化**；旧文档若没写 web-app/preset 层，这次是补齐。 |

> 其余 350+ 个变更文件（多数是 preset 内容、locale、测试）不影响本规格，未列出。

### 10. `packages/experimental/timeline` 对插件写法的影响（**是，改变了写法**）

| 维度 | timeline 的做法 | 对 dsh-taskline 的含义 |
|---|---|---|
| `package.json` 的 `dsh` 段 | **只有** `bundle{patch}` + `client{platform, inject}`；**没有** `manifestVersion/kind/capabilities/labels/compatibility` | 再次确认 1b–1d、1g：那些字段在真实官方插件里也不存在 |
| `cordis.patch.yml` | **只有 3 行**：`- insert: [- id: timeline-experimental / name: '@deepseek-ai/dsh-timeline']` | 一个插件包 = 一行 entry；组合多个子包才是"组合包" |
| 工具注册 | `ctx.effect(() => ctx.tools.register(defineTool({ name, description, parameters, output:{schema,render,presentationMeta?}, execute, presentCall })), 'label')` | 抄这个骨架；`presentCall` 给工具卡标题 |
| 记录写入 | `storage.append(session, 'plugin:timeline/tree', fn)` 内部调 `appendPluginRecord(session, type, encoded)`（`packages/experimental/timeline/src/storage.ts:446`） | 记录写入要**先 flush 落盘**（`await ctx.sessions.flush(session)`，见 `tools.ts:69-70`），且失败时抛错要求持久化可用 |
| 记录类型 | `declare module '@deepseek-ai/dsh-session/types' { interface PluginRecordMap { 'plugin:timeline/tree': TreeRecord } }` | 照抄（见 7f） |
| 提示注入 | `ctx.systemPrompt.section({name, order:120, text:(ctx)=>…})` + `ctx.systemPrompt.context({name, order:120, required:true, text:(ctx)=>…})` | 静态指令与动态状态分开；幂等/重建交给 harness |
| 活配置 | `Schema.object({...}).volatile()` + 覆写 `~standard.validate` 做跨字段校验 + `liveConfig(input)` 用 getter 读活值 | 照抄（见 5a） |
| 设置页 | 客户端 `ctx.configForms.get<Config>('timeline-experimental')`，**namespace = entry id** | dsh-taskline 的 namespace 必须是自己的 entry id（如 `taskline-core`） |
| 工具卡 | 客户端 `ctx.slots.register({ name: 'tool.call.toolview', key: 'timeline_tasks', ... })`（`packages/experimental/timeline/src/client/index.ts:101-110`） | issue §5.3 的"紧凑工具卡"有现成机制（key = 工具名） |
| 侧栏 / Dock | `ctx.sidebarRight.openTabIn(sessionId, 'timeline')` + 客户端组件 | issue §5.1/§5.2 有现成机制 |
| 斜杠命令 | `ctx.inject(['commands'], scope => scope.effect(() => scope.commands.register({ name: 'timeline', description, input:{hint}, handler })))`（`packages/experimental/timeline/src/command.ts:15-80`） | 名字单 token；参数走 `rawInput` |
| LLM 辅助调用 | 自己声明 purpose：`declare module '@deepseek-ai/dsh-llm/types' { interface LlmRequestPurposeMap { 'timeline-report': true } }`（`packages/experimental/timeline/src/summary.ts:10-14`） | **这正是 issue §4.3 "不带 `purpose: 'compaction'`" 的正确落地方式**：声明自己的 purpose（如 `'taskline-summary'`），而不是复用 `compaction`（`packages/compaction/compaction-basic/src/types.ts:7-11`） |

**结论**：0.2.3-alpha.2 确实改变了插件写法——不是 API 层面的大改，而是**"官方样板"从无到有**。dsh-taskline 的每个模块都应先在 timeline 里找到对应物再动手。

---

## ③ 不一致与真实机制（可直接抄的代码骨架）

### 3.1 组合包与子包的正确拓扑

```jsonc
// packages/dsh-taskline/package.json（组合包 = bundle）
{
  "name": "dsh-taskline",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.js",
  "exports": { ".": "./src/index.js", "./package.json": "./package.json" },
  "files": ["src", "cordis.patch.yml"],
  "engines": { "node": ">=24.9.0", "dsh": ">=0.2.3-alpha.0 <0.3.0" },
  "peerDependencies": { "@deepseek-ai/dsh": ">=0.2.3-alpha.0 <0.3.0" },
  "peerDependenciesMeta": { "@deepseek-ai/dsh": { "optional": true } },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "dependencies": {
    "dsh-taskline-core": "0.1.0",
    "dsh-taskline-ui": "0.1.0",
    "dsh-taskline-compactor": "0.1.0"
  }
}
```

```yaml
# packages/dsh-taskline/cordis.patch.yml —— 只插自己的行；不改 compaction
- insert:
    - id: taskline-core
      name: dsh-taskline-core
    - id: taskline-ui
      name: dsh-taskline-ui
    - id: taskline-compactor
      name: dsh-taskline-compactor
```

> 子包 `package.json`：**不要** `dsh.bundle`、**不要** `cordis.patch.yml`。子包若要带浏览器半边，则声明 `dsh.client`（`platform: "web"` + `inject: [...]`）并导出 `./client`。

### 3.2 禁用默认 compaction 的正确位置

```yaml
# 用户 profile 的 cordis.patch.yml（第 ② 层，永远在所有 bundle 之后）
- id: compaction-basic
  disabled: true
- id: command-compact
  disabled: true
```

并在 **preset 层**（`packages/bundle/web-app/presets/*.patch.yml` 里的 `compaction` group）替换成 taskline 的行——否则每个 agent preset 仍会挂自己的 `compaction-basic`。

### 3.3 工具骨架（0.2.3-alpha.2 正确写法）

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

const output = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { taskId: { type: 'string', required: true }, startSeq: { type: 'number', required: true } },
  } as const,
  render: (_args: unknown, value: { taskId: string; startSeq: number }): ContentBlock[] => [
    { type: 'text', text: `任务已开启：${value.taskId}（起点 ${value.startSeq}）。请以任务为中心执行。` },
  ],
}

ctx.effect(
  () => ctx.tools.register(defineTool({
    name: 'task_start',
    description: '显式声明一个新任务。',
    parameters: { title: { type: 'string', required: true }, parentTaskId: { type: 'string' } },
    output,
    async execute(args, exec) { /* 返回 canonical JSON 值 */ },
    presentCall: args => ({ card: 'generic', title: '开启任务', kind: 'other', rawInput: args.title }),
  })),
  'taskline: task_start tool',
)
```

### 3.4 门禁拒绝（结构化）

```ts
ctx.effect(() => ctx.tools.guard((exec) => {
  if (exec.name !== 'compress') return undefined
  const hit = openTaskOverlapping(exec)
  if (hit === undefined) return undefined
  return { reason: `这次 compress 被拒：区间跨过了 open task ${hit.taskId}`, info: { name: 'TasklineGate', code: 'TASKLINE_GATE' } }
}), 'taskline: compaction gate')
```

拒绝结果：`content = 'Error: <reason>'`、`isError: true`、`error.info = { name:'TasklineGate', code:'TASKLINE_GATE' }`（`packages/core/tools/src/pipeline.ts:214-226`）。

### 3.5 提示注入（section + context）

```ts
ctx.systemPrompt.section({
  name: 'taskline:mode',
  order: 120,
  text: '你当前在 taskline 模式下工作。任务名不准确时调用 task_rename；完成后调用 task_complete。',
  interpolate: false,
})

ctx.systemPrompt.context({
  name: 'taskline:state',
  order: 120,
  required: true,
  text: ({ agent }) => (agent === undefined ? '' : describeCurrentTask(agent)),
  interpolate: false,
})
```

### 3.6 插件记录

```ts
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Save the task tree and the tool call that changed it. */
    'plugin:taskline/tree': TaskRecord
  }
}

// 写入
await ctx.sessions.flush(session)
const seq = appendPluginRecord(session, 'plugin:taskline/tree', record)

// 读回
for (const event of session.snapshotEvents()) {
  const record = pluginRecordOf(event)
  if (record?.type === 'plugin:taskline/tree') { /* record.data 是 JSON */ }
}
```

### 3.7 斜杠命令

```ts
ctx.inject(['commands'], (scope) => {
  scope.effect(() => scope.commands.register({
    name: 'taskline',
    description: 'Taskline controls',
    input: { hint: 'gate off' },
    handler: async ({ rawInput }) => {
      if (rawInput.trim() === 'gate off') { /* 关掉门禁 */ return { kind: 'success', text: '门禁已关闭（仅本次会话）' } }
      return { kind: 'error', text: 'Usage: /taskline gate off' }
    },
  }), 'taskline: command')
})
```

---

## ④ 需实测（本机未执行）

| # | 待实测项 | 为什么必须实测 | 建议方法 |
|---|---|---|---|
| V1 | 外部插件**替换** `ctx.compaction` 的真实行为（Cordis 同名 Service 是"后者覆盖"还是"后者报错"） | 决定 issue §4.2 "后注册的赢 / 卸载即回退"能否成立 | 在隔离实例（`DSH_HOME` + 独立端口）里同时挂 `compaction-basic` 与 taskline-compactor，看 `ctx.get('compaction')` 是谁、卸载后是谁 |
| V2 | preset 的 `compaction` group（`isolate: { compaction: true }`）对外挂载的 `ctx.compaction` 与 host 作用域的关系 | 决定 taskline 压缩器是"进 group"还是"改 preset 行" | 在 preset 的 `compaction` group 里把 `compaction-basic` 换成 taskline 行，看 `ctx.compaction` 是否解析到 taskline 实现 |
| V3 | `appendPluginRecord` 在**仓库外插件**调用时是否还有第二道运行时限制 | 仓库门禁只管仓库内源码，但需要确认 Host 侧无额外拦截 | 外部包调用一次，看是否抛错 |
| V4 | `--dump-config` 在 **desktop / web profile** 下的实际输出（entry 树 + `disabled` 标记 + 分层注释） | 断言 issue §7 的组合测试需要真实输出格式 | `dsh --profile <p> --dump-config`，对照 `packages/bundle/web-app/cordis.patch.yml` 的层顺序 |
| V5 | `agent.inject()` 注入的 `UserMessage` 是否真的进入 surface、是否计入"模型可见" | issue §3.4 的备选注入路径依赖它 | 起一个会话，注入后看 session log 的 `user/message` 事件 |
| V6 | `ctx.configForms.get(ns)` 的 `ns` 在"一个包多行 entry"时取哪个 entry id | taskline-core 若拆多行，namespace 归属需确定 | 看 `SettingsForms.describe()`（`packages/settings/settings/src/index.ts:298-300`）返回的 key 集合 |
| V7 | `compactSurfaceRegion` 能否被外部插件直接 import | 它**不在** `@deepseek-ai/dsh-compaction-basic` 的根导出里（`packages/compaction/compaction-basic/src/index.ts` 只导出 `BasicCompactionEngine` 与类型；`region.ts` 未 re-export）；`exports` 里虽有 `"./src/*"`，但指向 TS 源码 | 在外部包里 `import { compactSurfaceRegion } from '@deepseek-ai/dsh-compaction-basic'` 实测。**预期结论：不可依赖**——taskline 需要自己实现事务，或改为继承 `CompactionEngine`（`packages/compaction/compaction/src/index.ts:119-193`）实现 `compactIfNeeded/compactNow/compactRegion` |
| V8 | bili 的 snapshot 端点行为（409 / 16 MiB 上限） | 属 04 文档范围，但 §6-2 依赖它 | 见 `docs/research/04-billion-context.md` |

---

## ⑤ 参考来源

**DSH 源码（一手）** `/Users/mutou/vault/projects/deepseek-harness` @ `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`（`0.2.3-alpha.2`，2026-11-22）

*包清单 / 启动*
- `packages/util/package-manifest/src/types.ts:8-99`（`DshPackageManifest` / `DshManifest` / `DshEnginesManifest` / `DshBundleManifest` / `DshProfileManifest` / `DshClientManifest`）
- `packages/util/package-manifest/src/client-module.ts:1-42`
- `packages/boot/app-boot/src/plugin-compatibility.ts:44-117`
- `packages/boot/app-boot/src/profile.ts:41-120, 755-762`
- `packages/boot/app-boot/src/profile-context.ts:57-86`
- `packages/boot/app-boot/src/index.ts:648-710`（`renderConfigDump`）
- `packages/boot/app-boot/src/startup-diagnostics.ts:1-40`
- `packages/boot/plugin-manager/src/operations.ts:85-135, 255-295`
- `packages/boot/plugin-manager/src/tools.ts:20, 89`
- `packages/boot/plugin-manager/src/versions.ts:1-80`
- `packages/boot/hmr/README.md`

*补丁语义*
- `vendor/include/src/patch.ts:1-274`
- `vendor/loader/src/config/tree.ts:165-166`、`vendor/loader/src/config/entry.ts:229-236`、`vendor/loader/src/config/utils.ts:74-102`

*组合层*
- `packages/bundle/base/cordis.patch.yml:1-14, 363-372`
- `packages/bundle/web-app/cordis.patch.yml:595-640`
- `packages/bundle/web-app/presets/standard.patch.yml:75-84`、`minimal.patch.yml:29-34`、`ptc.patch.yml:79-84`、`presets/cordis.patch.yml:68-84`
- `packages/bundle/sdk-minimal/cordis.patch.yml:64-65`

*工具*
- `packages/core/tools/src/index.ts:106-135, 380-406`
- `packages/core/tools/src/contracts.ts:1-103, 230-420`
- `packages/core/tools/src/events.ts:1-58`
- `packages/core/tools/src/pipeline.ts:186-234, 495-546`
- `packages/core/tools/src/schema.ts:470-600`

*Agent / 提示*
- `packages/core/agent/src/runtime-types.ts:134-146, 240-273, 330-351`
- `packages/core/agent-loop/src/agent.ts:271-320, 580-595`
- `packages/core/agent-loop/src/runtime-context.ts:1-93`
- `packages/core/system-prompt/src/index.ts:52-124, 191-262, 486-600`

*会话 / 插件记录*
- `packages/core/session/src/index.ts:185-267, 301-320, 440-470, 812-880`
- `packages/core/session/src/types.ts:510-570`
- `packages/core/session/src/surface.ts:237-300, 420-450, 570-600`
- `scripts/verify-plugin-record-callers.ts:1-45`
- `scripts/plugin-record-catalog.ts:1-100`

*压缩*
- `packages/compaction/compaction/src/index.ts:1-196`
- `packages/compaction/compaction/src/types.ts:1-120`
- `packages/compaction/compaction-basic/src/index.ts:1-150, 490-494`
- `packages/compaction/compaction-basic/src/region.ts:150-250, 300-350, 565-606`
- `packages/compaction/compaction-basic/src/types.ts:1-30`
- `packages/compaction/command-compact/src/index.ts:1-109`

*命令 / LLM / 设置*
- `packages/interaction/commands/src/index.ts:30-135, 179-292, 360-470`
- `packages/llm/llm/src/types.ts:550-606`
- `packages/llm/llm/src/index.ts:170-290`
- `packages/settings/settings/src/index.ts:200-300`
- `packages/client/ui-settings/src/client/config-form.ts:1-140`
- `apps/cli/src/dump-config.ts:1-76`

*官方同类插件（本版新增）*
- `packages/experimental/timeline/package.json`
- `packages/experimental/timeline/cordis.patch.yml`
- `packages/experimental/timeline/src/index.ts:1-55`
- `packages/experimental/timeline/src/tools.ts:1-121, 190-220`
- `packages/experimental/timeline/src/guidance.ts:1-90, 185-195`
- `packages/experimental/timeline/src/config.ts:1-249`
- `packages/experimental/timeline/src/command.ts:1-81`
- `packages/experimental/timeline/src/records.ts:250-282`
- `packages/experimental/timeline/src/storage.ts:410-461`
- `packages/experimental/timeline/src/summary.ts:1-25`
- `packages/experimental/timeline/src/client/index.ts:1-110`
- `packages/experimental/tool-session-query/src/index.ts:55-115`（真实存在的会话查询工具名）

*官方文档*
- `docs/cookbook/adding-a-settings-card.md`（Volatile、form、`configForms`、client 半边构建）
- `docs/cookbook/adding-a-tool.md`、`docs/cookbook/adding-a-package.md`
- `packages/boot/hmr/README.md`

**被审查的规格**
- GitHub issue #1（`hyperion2144/dsh-taskline`），§2 包结构、§3 taskline-core、§6 错误处理表

**历史对比**
- `git diff dsh-v0.2.2-alpha.3 dsh-v0.2.3-alpha.2 -- <paths>`（②9）
