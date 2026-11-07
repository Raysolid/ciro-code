---
title: 安全
description: 本地边界、密钥、出网与漏洞报告——信任相关入口页。
---

Ciro Code 按**本地优先**运行：密钥与会话在本机；出网主要是你启用的模型与工具。本页是信任总览；细则链到专文。

## 你应默认相信什么

| 承诺 | 含义 |
|------|------|
| 无 Ciro 云改码代理 | 不会把整仓上传到托管服务代改 |
| Key 留本机 | `~/.ciro/credentials/` 等；见下 |
| 模式约束工具 | Ask/Plan 偏只读；Agent/Debug 可写但可审批 |
| 可审计 Kernel | MIT 开源边界见 [开源范围](/open-core/what-is-open/) |

## 密钥

| 位置 | 用途 |
|------|------|
| `~/.ciro/credentials/` | 已存 API Key |
| `~/.ciro/providers.json` | Provider 配置（无明文 Key） |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | 可选环境默认 |

日常用 [模型与 Provider](/customize/providers-models/) 或 [连接模型](/getting-started/first-provider/) 配置。  
**禁止**把真实密钥提交进 Git 或贴进公开 Issue。

## 权限与审批

- 预设与白名单：[权限与安全](/guides/permissions/)  
- 模式边界：[工作模式](/guides/modes/)  
- 敏感 Shell / 越界路径会弹审批（允许一次 / 记住 / 拒绝）

## 数据与出网

- 落盘：`~/.ciro/` 与 `{workspace}/.ciro/` — [数据与隐私](/concepts/data-and-privacy/)  
- 出网：你配置的 LLM；以及你启用的 MCP / WebFetch 等  
- `ciro web --mock` **不**调用真实模型 Provider

## 扩展信任

只装你信任的官方 Feature Pack 与 MCP；安装 ≠ 启用。选型见 [如何选择扩展方式](/customize/chooser/) · [Feature Packs](/guides/packs/) · [MCP](/guides/mcp/)。

## 报告漏洞

请通过 GitHub [Security Advisories](https://github.com/Raysolid/ciro-code/security/advisories/new) **私下**报告。  
完整政策：[SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。  
修复以最新 npm 的 `@ciro-code/code` / `@ciro-code/cli` 为准，报告前请先升级。

## 接下来

- [权限与安全](/guides/permissions/) · [开源范围与承诺](/open-core/what-is-open/) · [排障](/guides/troubleshooting/)
