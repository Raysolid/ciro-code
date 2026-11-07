---
title: 快捷键
description: Web 工作台与终端 TUI 常用快捷键与输入约定。
---

随版本可能微调；以界面内 `/help` 与页脚提示为准。

## 共用输入约定

| 输入 | 作用 |
|------|------|
| `@` | 搜索并引用工作区文件 |
| `/` | 打开斜杠命令（如 `/help`） |
| `Shift+Tab` | 循环工作模式（Ask → Plan → Agent → Debug） |
| `Esc` | 停止当前回合 / 取消进行中的生成 |

Composer 占位提示通常类似：`给 Ciro 发消息… /命令 · @文件`。

## 终端 TUI

| 按键 / 命令 | 作用 |
|-------------|------|
| `Shift+Tab` | 切换模式 |
| `/help` | 命令与快捷键说明 |
| `@` | 引用文件 |
| `Esc` | 停止 |

页脚常见提示：`Shift+Tab:模式 | /:命令 | @:文件 | Esc:停止`。

启动续聊：

```bash
ciro --continue
ciro --resume <session-id>
```

## Web 工作台

| 操作 | 作用 |
|------|------|
| 顶栏模式标签 | 切换 Ask / Plan / Agent / Debug |
| Composer 中 `@` / `/` | 与上表相同 |
| **Changes** 标签 | 查看 Agent 写入的 Diff |
| 设置 | Provider、权限、MCP、Packs |

浏览器级快捷键（复制、查找等）遵循系统与浏览器默认。

## 相关

- [Web 工作台](/surfaces/web-workbench/) · [终端界面](/surfaces/terminal-tui/) · [工作模式](/guides/modes/) · [CLI](/reference/cli/)
