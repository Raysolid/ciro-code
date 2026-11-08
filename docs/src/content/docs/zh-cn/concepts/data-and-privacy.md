---
title: 数据与隐私
description: 配置与会话落在哪里，以及什么会离开本机。
---

Ciro Code 按**本地优先**设计：工作产物默认留在磁盘；出网主要是你配置的模型推理。

## 落盘位置

| 路径 | 内容 |
|------|------|
| `~/.ciro/` | 用户配置、凭证、Pack、会话目录 `sessions/`、跨项目偏好 |
| `{workspace}/.ciro/` | 工作区配置、规则、记忆、计划及相关项目状态 |

API Key 保存在本机（常见为用户配置或环境变量），**不会**经 Ciro 云中转。

## 什么会出网

- **会**：向你启用的 LLM Provider 发送对话与工具结果所需的推理请求（内容范围取决于模型与任务）  
- **默认不会**：把整仓上传到 Ciro 托管服务（产品不提供此类代理）  
- **工具侧**：WebFetch 等显式联网工具仅在策略允许且任务需要时使用  

更细的策略与 Shell 边界见[权限与安全](/guides/permissions/)。

## 开源与审计

执行核心（Kernel / CLI）MIT 开源，便于自行审计本地安全边界。范围说明：[开源范围与承诺](/open-core/what-is-open/)。  
信任总览与漏洞入口：[安全](/trust/security/)。

## 接下来

- 心智模型：[工作原理](/concepts/how-it-works/)  
- 权限预设与审批：[权限与安全](/guides/permissions/)  
- 模型连接：[模型与 Provider](/customize/providers-models/)  
