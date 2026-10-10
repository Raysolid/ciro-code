---
title: 概览
description: Ciro Code 是什么，以及与 Ciro Chat 的关系。
---

Ciro Code 是带 **本地 Web 工作台** 的编码 Agent。它在你的项目目录中工作，在策略沙箱下调用工具，并支持四种模式：**Ask**、**Plan**、**Agent**、**Debug**。

## 表面

| 表面 | 作用 |
|------|------|
| **CLI** | `ciro` — 安装 Pack、启动服务、doctor / migrate / debug |
| **Web UI** | 本地工作台 `http://127.0.0.1:3080` |
| **Packs** | 可选 Feature Pack（如 Git），安装到 `~/.ciro/packs/` |

## 数据本机

配置、密钥与会话保存在本机：工作区 `.ciro` 与用户目录 `~/.ciro`。出网仅限于你启用的模型服务商与工具。详见 [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。

## Ciro Chat

Ciro Chat 是另一款多模型聊天产品。Chat **不**托管本文档站，也不托管 Ciro Code 工作台。请用 npm 在本机安装运行 — 见 [安装](/getting-started/install/)。
