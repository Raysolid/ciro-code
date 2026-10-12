---
title: Rules & Skills
description: Shape agent behavior using project rules and on-demand skills.
---

Ciro Code provides a two-tiered extensibility system: **Rules** and **Skills**. They allow you to align the agent with your project's conventions without manual prompt engineering.

---

## Project Rules

Rules enforce coding standards, testing conventions, and architecture policies. When constructing reasoning context, Ciro Code dynamically attaches rules matching relevant files.

### Storage locations

- **Project-level rules**: `{workspace}/.ciro/rules/**/*.md` (shared with the team via Git)
- **User-level rules**: `~/.ciro/rules/**/*.md` (personal conventions across all projects)
- **Root instructions**: `AGENTS.md` in the workspace root

### Rule file format

Each rule is an independent Markdown file with frontmatter declaring path patterns (`globs`):

```markdown
<!-- {workspace}/.ciro/rules/react-conventions.md -->
---
description: React component standards and state patterns
globs: ["src/components/**/*.tsx", "src/hooks/**/*.ts"]
---

# React Conventions

1. **Props**: Every component must declare an explicit TypeScript Props interface; `any` is forbidden.
2. **Styling**: Use utility classes (Tailwind CSS); never write inline style objects.
3. **Effects**: `useEffect` hooks must declare complete dependency arrays and return cleanup functions on unmount.
4. **Testing**: Public UI components must include interaction tests under `__tests__/` with Vitest and Testing Library.
```

When Ciro reads or modifies files matching these `globs`, the rule text is injected into the prompt context automatically.

---

## On-Demand Skills

Skills are specialized runbooks for complex or multi-phase workflows. Unlike persistent rules, Skills are loaded **on demand** and bounded by strict token budgets.

### Key capabilities

- **Trigger on intent**: Loaded only when the user's intent or task matches the skill's declared description.
- **Dependency declaration**: Skills can declare `requiresMcp`. If the required MCP server is not active, the skill is safely skipped.
- **Location**: Placed in `{workspace}/.ciro/skills/<skill-name>/` or globally in `~/.ciro/skills/`.

### Skill structure example

```text
.ciro/skills/db-migrate/
├── SKILL.md       # Step-by-step procedures and constraints
└── meta.json      # Triggers, budgets, and dependencies
```

```json
// .ciro/skills/db-migrate/meta.json
{
  "name": "db-migrate",
  "description": "Database migration and Flyway SQL runbook",
  "requiresMcp": ["postgres-mcp"],
  "tokenBudget": 800
}
```

```markdown
<!-- .ciro/skills/db-migrate/SKILL.md -->
# Database Migration Runbook

1. Create versioned SQL scripts under `resources/db/migration/`: `V{yyyyMMdd_HHmm}__{name}.sql`.
2. All DDL statements must remain backwards-compatible. Never issue destructive DROP COLUMN queries.
3. Query schema lock status via `postgres-mcp` prior to running migrations.
```

---

## Best practices

1. **Keep Rules actionable and short**: Rules define constraints, not full tutorial articles.
2. **Use precise `globs`**: Avoid blanket injection; targeting specific folders saves context window capacity.
3. **Commit project rules**: Check `{workspace}/.ciro/rules/` into Git so both developers and AI agents adhere to identical standards.
