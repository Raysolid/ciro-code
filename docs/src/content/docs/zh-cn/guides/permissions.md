---
title: 权限
description: 沙箱、审批与 Shell 白名单。
---

Ciro Code 在**工作区沙箱**内按模式允许列表运行工具。敏感操作可能需要确认。

## 预设

配置可选只读 / 可写等权限预设（见 [配置](/reference/config/) 与 `ciro config wizard`）。

## Shell 白名单

Agent 的 shell 命令可受白名单约束（设置 → Agent / 权限）。可按 UI 提示允许一次或记住命令。

## 网络

- 模型请求发往你配置的服务商。
- `WebFetch` 与 MCP 仅在策略允许且被调用时出网。
- 策略会拦截随意的 `curl` / `wget` / PowerShell Web cmdlet；请用内置 fetch 工具。

密钥与出网说明见 [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。
