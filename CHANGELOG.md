# Changelog

## [Unreleased]

### Added

- 任务树压缩状态/总结/前后 token、可折叠工具卡、独立 taskline 上下文注入；bili 自动 fold 镜像回写并对跨进行中任务 fold 拒绝回写。
- 任务模型与 `task_start` / `task_complete` / `task_status` / `task_rename` / `task_abandon` / `task_reopen` 工具，任务以插件记录落会话日志（#21、#22）。
- composer dock、任务工具卡、右栏任务树/压缩事件与插件详情配置（#23、#24）。
- 任务感知 native 压缩：三触发、裁边、`/taskline compact` 与 `gate off`（#25）。
- bili 随组合包安装，新增任务级 `task_compress` / `task_bili_status`，bili 压缩结果回写 DSH surface（#28）。
- 隔离 headless/web 验收脚本与兼容矩阵（#27）。
- 系统提示注入 taskline 使用指导与当前 open 任务状态，模型据此决定何时建任务、何时压缩。
