---
title: 快捷键与 Slash 命令
description: Web 工作台与终端 TUI 键盘快捷键、输入约定与完整 Slash 斜杠命令索引。
---

Ciro Code 在 Web 工作台与终端 TUI 中保持高度一致的键盘驱动体验。本页汇总所有输入约定、快捷键与 Slash 斜杠命令。

---

## 核心输入约定

| 输入 | 适用场景 | 作用 |
|------|---------|------|
| `@` | Composer | 工作区文件检索与引用 |
| `/` | Composer | 打开 Slash 命令菜单 |
| `Shift + Tab` | 全局 | 循环切换 Ask → Plan → Agent → Debug |
| `Esc` | 全局 / 会话中 | 中断生成、取消审批或关闭浮层 |

---

## Slash 命令

在 Composer 或 TUI 输入 `/` 触发补全：

| 命令 | 参数 | 说明 |
|------|------|------|
| `/help` | - | 显示 Slash 命令与快捷键帮助 |
| `/new` | - | 开启新会话并重置工作上下文 |
| `/mode` | `[ask\|plan\|agent\|debug]` | 切换工作模式，例如 `/mode agent` |
| `/model` | - | 打开模型切换面板 |
| `/session` | `[id]` | 会话列表；别名 `/sessions`、`/resume` |
| `/compact` | - | 手动压缩上下文，整理历史回合 |
| `/clear` | - | 清空界面历史显示，不删除磁盘会话 |
| `/settings` | - | 快速设置：滚动、Vim、主题等 |
| `/theme` | `[dark\|light]` | 切换明暗主题 |
| `/mcp` | - | 管理本会话 MCP；宜在首条消息前配置 |
| `/minimal` | - | TUI：退出 Alternate Screen，行内流式输出 |
| `/fullscreen` | - | TUI：进入全屏 Alternate Screen |
| `/quit` | - | 退出应用；TUI 别名 `/exit` |

---

## 终端 TUI 快捷键速查

在终端运行 `ciro` 或 `ciro tui` 时支持的快捷键：

### 1. 全局导航与控制
| 快捷键 | 功能 |
|--------|------|
| `Ctrl + C` | 中断当前正在运行的任务或推理 |
| `Ctrl + D` | 退出终端 TUI |
| `Ctrl + S` | 打开 / 折叠会话列表面板（Session Picker） |
| `Ctrl + G` | 打开 / 折叠代码变更面板（Changes / Diff 审阅） |
| `Ctrl + T` | 打开 / 折叠 Subagent 子任务视图 |
| `Ctrl + L` | 重新绘制终端屏幕（清除渲染残影） |
| `Ctrl + Q` | 清空当前排队中的待发送消息 |

### 2. 消息编辑与发送（Composer）
| 快捷键 | 功能 |
|--------|------|
| `Enter` | 提交并发送当前消息 |
| `Shift + Enter` / `Alt + Enter` | 在输入框中插入换行 |
| `Shift + Tab` | 循环切换工作模式（Ask / Plan / Agent / Debug） |
| `Up` / `Down` | 浏览并召回历史输入指令 |
| `Ctrl + V` | 粘贴剪贴板文本或图片 |

### 3. Changes 代码变更审阅面板
当按下 `Ctrl + G` 审阅 Agent 写入的代码 Diff 时：
| 快捷键 | 功能 |
|--------|------|
| `a` | 接受当前选中的文件改动 |
| `r` | 拒绝并撤销当前选中的文件改动 |
| `A` | 接受所有变更（Accept All） |
| `R` | 拒绝并回退所有变更（Reject All） |
| `Tab` | 在变更文件列表与 Diff 内容区之间切换焦点 |

---

## Web 工作台交互方式

在浏览器打开 `http://127.0.0.1:5280` 时：

- **顶栏模式标签**：单击即可在 Ask、Plan、Agent、Debug 之间即时无缝切换；
- **Changes 标签页**：以 Side-by-Side（双列对比）或 Inline 视图核对文件改动，支持单文件确认与一键复制；
- **文件树与 @ 联动**：在右侧文件树点击文件图标或在 Composer 输入 `@` 可快速把文件绝对/相对路径拉入提示词；
- **审批弹窗**：当 Agent 触发未在白名单中的 Shell 指令时，界面中央弹出审批交互框（支持「允许一次」、「记住并允许」、「拒绝」）。

---

## 接下来

- [工作模式详解](/guides/modes/)
- [命令行 CLI 参考](/reference/cli/)
- [配置文件规范](/reference/config/)
