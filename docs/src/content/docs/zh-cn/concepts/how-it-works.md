---
title: 工作原理
description: 本地进程、工作区、会话、工具环，以及模式与模型的区别。
---

Ciro Code 是围绕模型的 **Agentic Harness**：模型负责推理，本地工具负责读、搜、改、跑命令。给出目标后，系统循环搜集上下文、执行并核对结果；可随时中断或调整方向。

推理只发往你配置的 Provider，不经过 Ciro 云端代理。

## 工具环

```text
搜集上下文 → 策略裁决 → 受控执行 → 验证 → 循环
```

1. **搜集上下文** — 使用 `read`、`list_files`、`grep`，并按需注入匹配的 [Rules / Skills](/guides/rules-skills/)
2. **策略裁决** — 由 [模式](/guides/modes/) 与 [权限](/guides/permissions/) 决定放行、拒绝或弹窗审批
3. **执行** — 在允许时使用 `edit`、`write`、`bash`，限制在工作区沙箱内
4. **验证** — 审阅 Diff、测试与报错，继续迭代或等待指示

只读问题可能在第 1 步结束；复杂任务会多轮循环。

## 可访问资源

| 资源 | 说明 |
|------|------|
| 工作区文件 | 当前项目树；写入受模式与审批约束 |
| 本机 Shell | 本地命令环境；经 `bash`、白名单与审批 |
| Git 状态 | 有 Git 时的分支与脏工作区 |
| 项目指令 | 根目录 `AGENTS.md`、`.ciro/rules`、Skills；见 [如何选择扩展方式](/customize/chooser/) |
| 会话历史 | `~/.ciro/sessions/`；见 [工作区与会话](/guides/workspace-session/) |

## 内置工具

| 工具 | 作用 |
|------|------|
| `read` | 读文件 |
| `list_files` | 列目录 |
| `grep` | 工作区搜索 |
| `bash` | 执行 Shell；受白名单与审批约束 |
| `edit` / `write` | 定点修改或创建覆盖；需可写模式 |
| `WebFetch` / `Task` / 计划类工具 | 视模式额外开放 |

## 入口与内核

| 入口 | 命令 | 适合 |
|------|------|------|
| Web 工作台 | `ciro web` | Diff、设置、Pack、较长审阅 |
| 终端 TUI | `ciro` / `ciro tui` | 终端内全屏会话 |

## 模式与模型

- **模式** — 允许哪些工具、能否写文件
- **模型** — 谁来推理；在 **设置 → 模型** 中独立切换

不要用换模型代替换模式：只读探索用 Ask，落地改码用 Agent。

## 相关文档

[快速开始](/getting-started/quickstart/) · [工作模式](/guides/modes/) · [权限](/guides/permissions/) · [Web 工作台](/surfaces/web-workbench/) · [终端界面](/surfaces/terminal-tui/)
