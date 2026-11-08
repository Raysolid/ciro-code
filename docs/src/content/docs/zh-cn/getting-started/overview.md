---
title: 产品概览
description: Ciro Code 的定位、边界与上手路径。
---

Ciro Code 是**本地优先**的编码 Agent：在本机项目中读文件、跑命令、改代码。推理只发往你配置的 LLM 端点，不经过 Ciro 云端代理。

## 适用场景

- 源码、密钥与会话需要留在本机：用户目录 `~/.ciro/`，项目目录 `{workspace}/.ciro/`
- 按任务切换信任档：Ask → Plan → Agent → Debug
- 日常入口为 Web 工作台 `ciro web`，或终端 TUI `ciro`

## 边界

- 不是把仓库上传到云端再改码的托管服务
- 不是绑定单一厂商的 IDE；支持自备密钥与兼容端点

## 与托管 Agent 的差异

| | 常见托管 Agent | Ciro Code |
|--|----------------|-----------|
| 代码位置 | 常需同步或上传 | 留在本机 |
| 模型 | 常绑定单一厂商 | 自备密钥或兼容端点 |
| 风险控制 | 粗粒度或不透明 | 模式、权限与审批 |

## 上手步骤

1. [安装](/getting-started/install/) `ciro`
2. [快速开始](/getting-started/quickstart/)：打开工作台并完成第一次任务
3. [连接模型](/getting-started/first-provider/)；也可先用 `ciro web --mock`

## 相关文档

| 主题 | 文档 |
|------|------|
| 工具环 | [工作原理](/concepts/how-it-works/) |
| Ask / Plan / Agent / Debug | [工作模式](/guides/modes/) |
| Web / TUI | [Web 工作台](/surfaces/web-workbench/) · [终端界面](/surfaces/terminal-tui/) |
| 仓库约定与扩展选型 | [如何选择扩展方式](/customize/chooser/) |
| 官方 Pack，例如 Git | [Feature Packs](/guides/packs/) |
| MIT 开源范围 | [开源范围与承诺](/open-core/what-is-open/) |
