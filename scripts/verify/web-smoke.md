# Web 冒烟清单（人工，逐项打勾）

前置：隔离实例，不触碰日常 profile。

```bash
export DSH_HOME="${TMPDIR:-/tmp}/taskline-web-home"
export WT=/path/to/dsh-taskline-impl
dsh plugin --profile taskline-dev add \
  file:"$WT/packages/dsh-taskline" file:"$WT/packages/dsh-taskline-core" \
  file:"$WT/packages/dsh-taskline-ui" file:"$WT/packages/dsh-taskline-compactor" \
  file:"$WT/packages/dsh-taskline-bili" file:"$WT/packages/dsh-taskline-bili-adapter"
dsh --profile taskline-dev --port 8999 --host 127.0.0.1 --no-open
```

打开带 token 的地址后：

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 输入框上方出现 taskline dock（Timeline 进度条下方，不重影） | ☐ |
| 2 | dock 点“收起”变单行且保留任务名/百分比，点“展开”恢复分段条 | ☐ |
| 3 | 无任务时 dock 不显示 | ☐ |
| 4 | 发起会话后模型调用 `task_start`，会话流出现任务工具卡（含参数/返回） | ☐ |
| 5 | 点 dock“任务树”打开右栏 `任务` tab，节点显示状态与 `startSeq–endSeq` | ☐ |
| 6 | 嵌套开启（插件详情把嵌套层数改为 1）后建子任务：缩进、深度徽标、可折叠 | ☐ |
| 7 | 节点“完成/放弃/重开/改名”按钮生效，刷新后状态一致 | ☐ |
| 8 | 插件详情页出现配置表单；改 maxDepth / 自动创建阈值后保存成功并即时生效 | ☐ |
| 9 | `/taskline compact` 后右栏“压缩”tab 出现记录（backend/outcome/区间/任务/跳过项） | ☐ |
| 10 | 任务节点显示压缩状态 `none/partial/full` | ☐ |
| 11 | 与官方 Timeline 并存：Timeline dock 在上、taskline dock 在下，无遮挡/无重复渲染 | ☐ |
| 12 | 浏览器控制台无报错；刷新后投影状态一致 | ☐ |

记录：日期 / DSH 版本 / 结论 / 截图位置。
