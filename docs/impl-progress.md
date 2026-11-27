# 实施进度（T1–T7）

分支：`taskline-v0.1-impl`；worktree：本目录；基线 `fd6945b`。
提交纪律：整条分支一条提交记录，后续改动 `git commit --amend`。
不 push / 不 merge，完成时向用户请示。

## 已完成
- monorepo + 6 包骨架（dsh-taskline / core / ui / compactor / bili / bili-adapter）；组合包是唯一声明 `dsh.bundle` 的包。
- core 纯模型 `packages/dsh-taskline-core/src/model.js`：事件校验、fold（嵌套/父关闭/abandon 级联/fork）、锚解析（替换链）、压缩状态。
- 单测 9 条全绿：`node --test packages/dsh-taskline-core/test/*.test.js`。
- 已提交 `2c4a0bb`。

## T1 已完成（#21 关闭）
- 插件入口：task_start / task_complete / task_status；appendPluginRecord；tools/post-execute 自动创建（阈值 3，autoCreated=true）。
- 隔离 profile + mock LLM 验收通过：记录、resume、自动创建。
- 提交 `898699a`。

## T2 已完成（#22 关闭）
- task_rename / task_abandon / task_reopen 工具化；headless 验证 create→rename→abandon→reopen。
- fork：isSeeded 时追加带 sessionId 的 fork 事件，open 任务标 inherited。
- 安装教训：profile 用 file: 安装（复制）；link: 会断 peer 解析。

## T3 已完成（#23 关闭）
- ui 包：dsh.client + esbuild 打包 lazy-CJS；dock（order 30，可折叠）+ 5 个 task_* 工具卡。
- core 注册 Session Projection（key taskline），wire 形状由 projection-view.js 派生。
- 隔离 web 验证：host 激活、boot graph 含 dsh-taskline-ui、bundle 200。
- 提交 `dfe49c5`。

## T4 已完成（#24 关闭）
- 右栏 tab 类型 + 任务树 Panel + dock 打开按钮。
- host RPC `/taskline`（owner-only）：rename/complete/abandon/reopen；stateFor 用 session.seq 检测外部追加。
- Config schema（schemastery，11 项）+ 客户端 plugins.bundle.config 表单（taskline-core namespace）。
- 提交 `d6dfd77`。

## T5 已完成（#25 关闭）
- compactor：planRanges（closed-only、tasksLater、跨 open 切分）+ 串行队列 + enabled/gate + 三种触发。
- compact 事件含 requested/kept/skipped；投影 wire 增加 compactions；UI “压缩” tab 与节点压缩状态。
- 单测 17；web 启动无激活警告。
- 提交 `e38fb50`。

## T6 已完成（#26 关闭）
- dsh-taskline-bili：依赖 billion-context@0.1.216，提供 bili:runtime（health/status/snapshot/compress，origin env 或 18787）。
- dsh-taskline-bili-adapter：boundary messageId → snapshot rawId → ref；ref:null/未映射跳过；outcome 语义。
- compactor backend auto/native/bili；auto 回落 native。
- 单测 22 条全绿；headless 激活无警告；create 记录带 messageId。
- 提交 `4cd910d`。

## 最后一张：T7 验收矩阵
- scripts/verify/headless.sh + web 冒烟；package 安装矩阵；docs 更新；PR 准备。
