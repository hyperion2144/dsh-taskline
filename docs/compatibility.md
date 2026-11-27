# 兼容矩阵

## 已验证

| 组件 | 版本 |
|---|---|
| DeepSeek Harness | 0.2.3-alpha.2（commit 4b399c39a6） |
| billion-context | 0.1.216 |
| Node.js | >= 24.9.0 |

## 升级流程

1. 先跑 `scripts/verify/unit.sh` 与 `scripts/verify/headless.sh`；
2. 升级 DSH 后，确认 `agentPresets.serviceFor(agent,'compaction')`、`sessionProjections.register`、`slots`、`connection.rpc.handle` 未变；
3. 升级 bili 后，确认 `/__bili/plugin/{status,snapshot,tool}` 与 `outcome` 语义未变（适配器自禁用依据 `protocolVersion` 与 health）；
4. 两者都过再按 `scripts/verify/web-smoke.md` 人工冒烟。

## 已知边界

- headless profile 没有 `agentPresets`，native 压缩与 bili 后端只在 web profile 装配；headless 断言的是任务记录、resume 重建与卸载可读。
- bili 代理需独立运行（`bili start` 或 launcher 形态）；未运行时 `auto` 回落 native，`bili` 记 skipped。
- 插件记录 API 仍标记 experimental；升级 DSH 时需复核 `appendPluginRecord` / `pluginRecordOf`。
