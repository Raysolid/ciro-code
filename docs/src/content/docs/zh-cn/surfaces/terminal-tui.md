---
title: 终端界面
description: 用 `ciro` / `ciro tui` 在终端运行全屏会话。
---

默认子命令即为全屏 TUI：`ciro` 与 `ciro tui` 等价。

## 启动

在项目根目录执行，或任意目录加 `-w`：

```bash
ciro
ciro tui -w /path/to/project
ciro --mode ask --mock
ciro --continue              # 续最近会话
ciro --resume <session-id>   # 续指定会话
```

常用选项：`--mode`、`--mock`、`--profile`、`--minimal`。无 alternate screen 时也可用环境变量 `CIRO_TUI_MINIMAL=1`。

## 常用操作

- 输入自然语言任务；`@` 引用文件；`/` 打开命令，例如 `/help`
- `Shift+Tab` 循环 Ask / Plan / Agent / Debug
- `Esc` 停止当前回合
- 工具调用与回复在同一会话流中展示

完整对照见 [快捷键](/reference/shortcuts/)。

## 与 Web 的差异

| 能力 | TUI | Web |
|------|-----|-----|
| 模式、权限、工作区策略 | ✓ | ✓ |
| 全屏终端会话、`--continue` | ✓ | 侧栏会话列表 |
| Side-by-side Changes、设置页 | 较弱或无 | ✓ |
| Provider / Pack 图形配置 | 有限 | ✓ |

需要仔细审 Diff 或改 Provider 时，使用 [Web 工作台](/surfaces/web-workbench/)：`ciro web`。同一工作区下注意并发：默认勿多开冲突实例；确需并行时查阅 CLI 的 `--allow-concurrent` / `--local`。

## 成功时你应看到

- 全屏会话，页脚或状态区显示当前模式与工作区
- `/help` 能列出命令；Ask 任务不改仓库文件

## 相关文档

[快速开始](/getting-started/quickstart/) · [工作模式](/guides/modes/) · [探索代码库](/workflows/explore-codebase/)
