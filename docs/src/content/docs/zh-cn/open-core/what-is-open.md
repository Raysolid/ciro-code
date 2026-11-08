---
title: 开源范围与承诺
description: MIT 开源范围、可审计路径与本地数据承诺。
---

Ciro Code 的 **Kernel** 与 **CLI** 以 MIT 开源。你可以审计本地执行、策略沙箱与 HTTP/SSE API。我们承诺：本地数据永远在你的机器上，不会未经允许上传。

## 开源内容

| 组件 | 说明 |
|------|------|
| **Core Kernel** | 策略沙箱、记忆、上下文编排 |
| **CLI `ciro`** | 模式调度、doctor、pack 管理命令 |
| **HTTP + SSE API** | 本机 harness 服务 |
| **可自行编写的扩展** | Rules、Skills、MCP 配置 |

协议为 MIT。

源码：[GitHub](https://github.com/Raysolid/ciro-code)。

推理直连你配置的模型 Provider——代码与 API Key 不会经过 Ciro 云端代理。

## 使用含义

- **可审计执行路径** — Kernel 与 CLI 源码公开。
- **用开放机制定制** — [Rules / Skills / MCP](/customize/chooser/)。
- **密钥留在本机** — 凭据在 `~/.ciro/`；见 [权限与安全](/guides/permissions/) 与 [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。
- **日常使用** — 经 npm 安装，见 [安装](/getting-started/install/)；本地运行无需 Ciro 订阅。官方 Pack 见 [Feature Packs](/guides/packs/)。

## 参与贡献

研读或改动开源 Kernel / CLI：见 [开源 Kernel](/project/contributing/)。
