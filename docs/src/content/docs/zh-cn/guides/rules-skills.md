---
title: Rules 与 Skills
description: 使用项目规则与按需技能塑造 Agent 的编码行为。
---

Ciro Code 提供 **Rules（规则）** 与 **Skills（技能）** 两层扩展机制，帮助你在不修改提示词工程的前提下，使 Agent 完全适应你的技术栈与工程约定。

---

## 项目规则（Rules）

规则用于约定项目的代码风格、测试规范与架构偏好。Ciro Code 在构建思考上下文时，会根据匹配的文件路径自动挂载生效的规则。

### 规则存放路径

- **项目级规则**：`{workspace}/.ciro/rules/**/*.md`（针对当前项目，随 Git 共享）
- **用户级通用规则**：`~/.ciro/rules/**/*.md`（跨所有项目生效的个人偏好）
- **通用项目契约**：工作区根目录下的 `AGENTS.md`

### 规则文件格式范例

每个规则均为独立的 Markdown 文件，支持通过 Frontmatter 声明适用文件匹配规则（`globs`）：

```markdown
<!-- {workspace}/.ciro/rules/react-conventions.md -->
---
description: React 组件编写与状态管理规范
globs: ["src/components/**/*.tsx", "src/hooks/**/*.ts"]
---

# React 开发规范

1. **组件设计**：每个组件必须声明明确的 TypeScript Props 接口，严禁使用 `any`。
2. **样式约定**：优先使用 Tailwind CSS 原子类，严禁直接书写内联样式。
3. **副作用控制**：`useEffect` 必须显式声明所有依赖项，并在组件卸载时返回清理函数。
4. **单测要求**：新创建的公共 UI 组件需在 `__tests__/` 下编写对应的 Vitest + Testing Library 交互测试。
```

当 Agent 读写匹配 `globs` 规则的文件时，规则内容会自动注入到系统提示词中，指导代码生成。

---

## 按需技能（Skills）

Skills 是专为特定复杂任务打造的“操作操作手册”。与常驻规则不同，Skills 采用**按需加载**机制，受严格的 Token 预算保护，避免上下文冗余。

### 核心特性

- **按需唤起**：仅当用户提问或任务意图与 Skill 声明的能力匹配时，才会动态加载具体操作步骤。
- **声明依赖**：Skill 可以通过 `requiresMcp` 声明所需的 MCP 服务。当对应服务未就绪时，Skill 会被优雅跳过。
- **存放位置**：存放在 `{workspace}/.ciro/skills/<skill-name>/` 或全局 `~/.ciro/skills/`。

### Skill 范例结构

```text
.ciro/skills/db-migrate/
├── SKILL.md       # 详细操作指引与注意禁忌
└── meta.json      # 触发词与依赖声明
```

```json
// .ciro/skills/db-migrate/meta.json
{
  "name": "db-migrate",
  "description": "数据库迁移与 Flyway 脚本编写指引",
  "requiresMcp": ["postgres-mcp"],
  "tokenBudget": 800
}
```

```markdown
<!-- .ciro/skills/db-migrate/SKILL.md -->
# 数据库迁移指引

1. 每次新建变更必须在 `resources/db/migration/` 下生成版本化 SQL 文件：`V{yyyyMMdd_HHmm}__{name}.sql`。
2. 所有 DDL 必须支持向前兼容，禁止直接执行破坏性的 DROP COLUMN。
3. 执行迁移前先使用 `postgres-mcp` 查询当前版本号与锁定状态。
```

---

## 最佳实践

1. **保持 Rules 简明精炼**：规则旨在立下边界，避免写成冗长的文档教程。
2. **善用 `globs` 过滤**：不要将通用规则无差别注入全部文件，精准指定目录能显著节省模型上下文。
3. **团队协作入库**：将 `{workspace}/.ciro/rules/` 纳入 Git 版本控制，使团队成员和 Agent 共享同一套工程底线。
