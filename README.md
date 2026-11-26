# dsh-taskline

以任务为核心的 DeepSeek Harness 插件：每个工作单元都有边界与 surface 区间，压缩只折已完成的任务区间，跨 open 任务自动裁边。

## 组成

| 包 | 作用 |
|---|---|
| `dsh-taskline` | 组合包（唯一 `dsh.bundle`）；依赖并内联激活完整 `billion-context@0.1.216` |
| `dsh-taskline-core` | 任务模型、工具、Session Projection、RPC、配置 |
| `dsh-taskline-ui` | Web 客户端：dock、工具卡、右栏任务树/压缩事件、插件详情配置 |
| `dsh-taskline-compactor` | 任务感知 native 压缩、`task_compress` / `task_bili_status` |
| `dsh-taskline-bili` | `bili:runtime` 门面（代理发现、health/status/snapshot/compress/compact） |
| `dsh-taskline-bili-adapter` | 任务边界 → bili ref 映射、compress 驱动、DSH surface 回写 |

## 安装

桌面端只能页面安装时，用本地脚本完成与 CLI 相同的 file: 安装（组合包 + 五个子包 + bili）：

```bash
scripts/install-local.sh <profile>
```


一条命令装齐：组合包会带齐 core/ui/compactor/bili/adapter 与 bili 本体；不要再单独安装 `billion-context`（会重复 entry id）。

```bash
# 克隆后一条命令：仓库根就是组合包，packages/ 下是它的五个子组件
dsh plugin --profile <profile> add link:/path/to/clone
```

组合包的 dependencies 指向仓库内五个子包代码并带 `billion-context`、`zod`、`schemastery`；不打包、不生成任何压缩产物。


装好后 bili-native 会自动拉起代理；在 web 里用模型调用 `task_compress` 压缩已关闭任务，压缩结果同时回写 DSH surface，bili 断开后上下文仍保持压缩态。

## 配置

插件详情页（`plugins.bundle.config`）：嵌套层数、自动创建阈值、压缩开关/后端/阈值/保留任务数、gate 提醒参数。bili 模式下自动压缩（延迟/阈值）失效，压缩由模型主动触发。bili 自身的周期 nudge 默认阈值较高（可压内容约 100k tokens），中等长度会话通常不会自动触发；需要时随时调用 `task_compress`。

## 验证

```bash
scripts/verify/unit.sh
DSH_REPO=/path/to/deepseek-harness scripts/verify/headless.sh
MINIMAX_CN_API_KEY=... scripts/verify/web.sh   # 真 web + Chrome：插件页/配置/真实三段对话/压缩断言
scripts/verify/teardown.sh
```

人工清单见 `scripts/verify/web-smoke.md`，兼容矩阵见 `docs/compatibility.md`。
