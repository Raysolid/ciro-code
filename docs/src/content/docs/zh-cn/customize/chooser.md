---
title: 如何选择扩展方式
description: 用满足需求的最小机制定制 Ciro——AGENTS、Rules、Skills、MCP、官方 Pack。
---

先选**够用的最小机制**，再叠加更重的扩展。能写进 `AGENTS.md` 的，不必先上 Pack。

## 决策表

| 需求 | 先用 | 说明 |
|------|------|------|
| 本仓库持久约定（风格、测试、禁止事项） | `AGENTS.md` 或 `.ciro/rules` | 每次相关会话都能看到；适合短而硬的规范 |
| 某类任务的操作手册（步骤长、按需加载） | [Skill](/guides/rules-skills/) | 描述匹配时才注入，省上下文 |
| 连接外部系统（Issue、浏览器、内部 API） | [MCP](/guides/mcp/) | 给 Agent 新工具，而不是改 Kernel |
| 官方工作台能力（如 Git 面板） | [Feature Pack](/guides/packs/) | 从 npm 安装，在设置中启用 |
| 换推理后端或模型 | [连接模型](/getting-started/first-provider/) · [模型与 Provider](/customize/providers-models/) | 与模式无关；模式管权限，模型管推理 |

## 推荐顺序

```text
AGENTS.md / Rules  →  Skills  →  MCP  →  官方 Pack
```

1. 用根目录 `AGENTS.md` 写清「始终要遵守的三到七条」  
2. 重复出现的长流程再抽成 Skill  
3. 需要仓库外系统时再接 MCP  
4. 需要某项官方产品能力时再安装对应 Pack  

## 反模式

- 用 Pack 只为塞一段提示词 → 改用 Rules / Skill  
- 用 MCP 替代本机已有的 `git` / 测试命令 → 先靠默认 Shell 与权限白名单  
- 把整本设计文档贴进 `AGENTS.md` → 拆短规则，细节用 `@` 文件或 Skill  

## 深读

- [规则与 Skills](/guides/rules-skills/)  
- [MCP 工具](/guides/mcp/)  
- [扩展 Pack](/guides/packs/)  
