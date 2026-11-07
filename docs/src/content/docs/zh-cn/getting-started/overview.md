---
title: 产品概览
description: Ciro Code 是什么、不是什么，以及从哪里开始。
---

Ciro Code 是**本地优先**的编码 Agent：在你机器上的项目里读文件、跑命令、改代码。推理只发往**你配置的模型端点**，没有 Ciro 云代理。

## 适合你，如果

- 希望源码、密钥、会话留在本机（`~/.ciro/` 与 `{workspace}/.ciro/`）
- 需要按任务切换权限：Ask（只读）→ Plan（先方案）→ Agent（受控改码）→ Debug（假设驱动排障）
- 日常入口是本地 **Web 工作台**（`ciro web`）或终端界面（`ciro`）

## 不是什么

- 不是把仓库上传到托管云端再改码的服务
- 不是绑定单一模型供应商的 IDE；Provider 由你自备（BYOK / 兼容端点）

## 三步上手

1. [安装](/getting-started/install/) `ciro`
2. 按 [快速开始](/getting-started/quickstart/) 打开工作台并完成第一次任务
3. 需要推理时 [连接模型](/getting-started/first-provider/)（也可先用 `ciro web --mock`）

## 接下来读什么

| 你想… | 去 |
|-------|-----|
| 弄清工具环、工作区、会话 | [工作原理](/concepts/how-it-works/) |
| 选对 Ask / Plan / Agent / Debug | [工作模式](/guides/modes/) |
| 熟悉 Web / 终端入口 | [Web 工作台](/surfaces/web-workbench/) · [终端界面](/surfaces/terminal-tui/) |
| 按任务走一遍 | [探索代码库](/workflows/explore-codebase/) |
| 教 Agent 遵守仓库约定 | [如何选择扩展方式](/customize/chooser/) |
| 数据落盘与出网边界 | [数据与隐私](/concepts/data-and-privacy/) |
