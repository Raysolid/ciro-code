---
title: 规则与 Skills
description: AGENTS.md、Rules 与按需 Skills——用最小机制教好 Agent。
---

用持久指令塑造行为时，按这条链选：**AGENTS.md → Rules → Skills**。更重的 MCP / Pack 见 [如何选择扩展方式](/customize/chooser/)。

## 何时用哪个

| 需求 | 用 |
|------|-----|
| 全仓库始终遵守的短约定（3～7 条） | 根目录 `AGENTS.md` |
| 个人跨项目偏好 | `~/.ciro/AGENTS.md` |
| 按路径生效的规范（如仅 `*.tsx`） | `.ciro/rules/*.md` |
| 长流程、按需加载的操作手册 | Skill（`SKILL.md`） |

## AGENTS.md

工作区根目录的 `AGENTS.md` 会作为项目级指令加载。写成**可执行的短规则**，不要贴整本设计文档。

```markdown
# AGENTS.md

- 修改公共 API 必须同步更新测试
- 禁止提交 `.env` 与密钥
- 优先改 `src/`，不要动生成目录
```

全局偏好写在 `~/.ciro/AGENTS.md`（跨工作区）。

## Rules

### 位置

| 范围 | 路径 |
|------|------|
| 项目（建议入库） | `{workspace}/.ciro/rules/**/*.md` |
| 用户 | `~/.ciro/rules/**/*.md` |

### 格式

Markdown + frontmatter。`globs` **为空或不写** → 常驻注入；**有 globs** → 仅当消息里出现匹配路径 token 时注入。

```markdown
---
description: React 组件约定
globs: ["src/components/**/*.tsx", "src/hooks/**/*.ts"]
---

# React

1. Props 必须有明确 TypeScript 接口，禁止 `any`
2. 样式优先 Tailwind，避免内联 style 对象
3. `useEffect` 写全依赖并在卸载时清理
```

## Skills

Skills 是**按需**手册：目录内 `SKILL.md`（或单文件 `.md`），元数据在 **frontmatter**（没有单独的 `meta.json`）。

### 位置

- 项目：`{workspace}/.ciro/skills/<name>/SKILL.md`
- 用户：`~/.ciro/skills/`

### 范例

```text
.ciro/skills/review/
└── SKILL.md
```

```markdown
---
name: review
description: 审 Diff 与测试风险
triggers: [@review]
requiresMcp: []
---

# Review

1. 列出变更文件与风险
2. 指出缺测路径
3. 不要直接改代码，除非用户明确要求
```

| 字段 | 含义 |
|------|------|
| `name` | Skill 名（可省略，默认用目录名） |
| `description` | 简述；参与匹配 |
| `triggers` | 如 `[@review]`；单文件无 triggers 时默认 `@name` |
| `requiresMcp` | 会话须已启用这些 MCP id，否则跳过注入 |

在对话里用触发词（如 `@review`）或 `/review` 类用法唤起；具体以当前版本匹配逻辑为准。注入有 token 预算，避免把百科写进 Skill。

## 实践要点

1. Rules 短、硬；细节用 `@` 文件或 Skill  
2. 有路径差异再加 `globs`，避免处处常驻  
3. 团队规范进仓库的 `.ciro/rules/` 与 `AGENTS.md`  
4. 需要外部系统工具再上 [MCP](/guides/mcp/)；需要官方工作台能力（如 Git）再上 [Pack](/guides/packs/)

## 接下来

[如何选择扩展方式](/customize/chooser/) · [MCP](/guides/mcp/) · [安全](/trust/security/)
