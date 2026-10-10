---
title: MCP
description: 在 Ciro Code 中使用 MCP 服务。
---

MCP 服务器为 Agent 提供外部工具（检索、浏览器自动化、自定义 API 等）。

## 为本会话启用

1. 在设置中配置 MCP 服务器。
2. 为**当前会话**启用需要的服务器（例如在 Composer **+** 菜单中，若适用）。
3. 已启用服务器的工具会按模式策略开放。

## 边界

- 只会连接你自行配置的服务器。
- 部分能力（如 browser Task）需 Playwright MCP 就绪后才会出现。
- Skills 可声明 `requiresMcp`，未启用对应服务时不注入。

当前版本没有云端「MCP 目录」产品面 — 请自行添加可信服务器。
