---
title: Feature Packs
description: 安装并启用官方工作台 Feature Pack。
---

官方 Feature Pack 为工作台提供可选能力（例如 Git 面板）。  
只加提示词 → [Rules / Skills](/guides/rules-skills/)；接外部系统 → [MCP](/guides/mcp/)。选型：[如何选择扩展方式](/customize/chooser/)。

## 原则

| 原则 | 含义 |
|------|------|
| 装在用户目录 | `~/.ciro/packs/`，不污染项目 `package.json` |
| 安装 ≠ 启用 | 必须在 **设置 → Feature packs** 显式打开 |
| 官方 id | 例如 `@ciro-code/ext-git` |
| 仍受沙箱约束 | 运行时读写服从 [权限](/guides/permissions/) |

## 安装与管理

```bash
ciro pack add @ciro-code/ext-git
ciro pack list
ciro pack remove @ciro-code/ext-git
```

`list` 会显示版本与是否已启用。

## 在工作台启用

1. `ciro web`  
2. **设置 → Feature packs**  
3. 打开开关（如 `@ciro-code/ext-git`）  
4. 按提示刷新后使用新面板

## 成功时你应看到

- `ciro pack list` 有包名  
- 设置里可开关；启用后出现对应 UI

## 失败时

- 找不到命令 → [安装](/getting-started/install/)  
- 启用无界面 → 确认开关为开并刷新；看终端报错  
- 需要的是提示词不是面板 → 改回 Rules / Skills

## 接下来

[Web 工作台](/surfaces/web-workbench/) · [安全](/trust/security/) · [命令行](/reference/cli/)
