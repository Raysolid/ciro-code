---
title: 开源范围与承诺
description: Open Core 边界——哪些 MIT 开源、哪些以 npm 产物交付，以及本地数据承诺。
---

Kernel 和 CLI 完全开源，你可以审计所有本地执行逻辑。Web UI 和官方 Profile 以 npm 安装产物交付，源码不开，这是为了维持项目的可持续开发和商业闭环。我们承诺：本地数据永远在你的机器上，不会未经允许上传。

## 开源面与交付产物

| 开源部分（MIT） | npm 安装产物 |
|----------------|--------------|
| **Core Kernel** — 策略沙箱、记忆、上下文编排 | **Web 工作台 UI** — 本地可视化操作界面 |
| **CLI（`ciro`）** — 模式调度、doctor、pack 管理 | **官方 Profiles** — 预置工作流与工程规则 |
| **扩展规范** — Rules、Skills、MCP 接入 | **官方 Feature Packs** — 如 `@ciro-code/ext-git` |

以上组件均安装并运行在你的本机。推理直连你配置的模型 Provider——代码与 API Key 不会经过 Ciro 云端代理。

## 对你意味着什么

- **可审计执行路径** — Kernel 与 CLI 源码在 [GitHub](https://github.com/Raysolid/ciro-code)，MIT 协议。
- **工作台可免费使用** — 通过 npm 安装即可本地运行，无需订阅；你只需为自己的模型 Token 付费。
- **密钥留在本机** — 凭据保存在磁盘 `~/.ciro/`；详见 [权限与安全](/guides/permissions/) 与 [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。

## 参与贡献

若要从源码构建或向开源 Kernel/CLI 提交改动，见 [从源码构建](/project/contributing/)。
