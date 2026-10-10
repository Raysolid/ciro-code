---
title: 产品概览
description: Ciro Code 是什么，适合什么场景。
---

Ciro Code 是本机优先的编码 Agent，直接在你的项目目录里工作。

你用 CLI 打开本地 Web 工作台；Agent 在你可控的策略沙箱里调用工具。

配置、密钥和会话都留在本机。只有你启用的模型服务商会收到请求；工具不会自行联网。

想马上上手？去 [快速开始](/getting-started/quickstart/)。需要安装命令？见 [安装](/getting-started/install/)。

## 什么时候用哪种模式

| 你想… | 用 |
|------|-----|
| 只问问题、不改文件 | **Ask** |
| 先想清楚再动手 | **Plan** |
| 让 Agent 改代码落地 | **Agent** |
| 排查失败或缺陷 | **Debug** |

模式决定工作流和工具权限；模型在设置里单独选。详见 [工作模式](/guides/modes/)。

## 扩展工作台

可选 Feature Pack 增加面板与工具（例如 Git）。用 CLI 安装后，再到设置里启用——安装不会自动打开。见 [扩展 Pack](/guides/packs/)。

## 隐私一句话

产品相关数据在 `{workspace}/.ciro/` 与 `~/.ciro/`。路径与出网细节见 [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。
