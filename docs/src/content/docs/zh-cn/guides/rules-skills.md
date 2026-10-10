---
title: Rules 与 Skills
description: 项目规则与按需 Skills。
---

## Rules

规则用于约定项目习惯与技术栈偏好。常见位置：

- `{workspace}/.ciro/rules/**`
- `~/.ciro/rules/**`

工作区根目录的 `AGENTS.md` 也可能作为项目指引加载。规则宜短、可执行。

## Skills

Skills 是按需注入的操作手册（有 token 预算）。可放在工作区或用户 `.ciro` 的 skill 目录，并可声明所需 MCP，仅在会话启用对应服务时生效。

在工作台设置与相关面板中管理 Skills。自动化安装说明见仓库 [AGENTS.md](https://github.com/Raysolid/ciro-code/blob/main/AGENTS.md)。
