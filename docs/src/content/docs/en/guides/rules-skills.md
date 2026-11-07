---
title: Rules & Skills
description: AGENTS.md, Rules, and on-demand Skills—teach the agent with the smallest mechanism.
---

When shaping behavior with persistent instructions, follow: **AGENTS.md → Rules → Skills**. Heavier MCP / Packs: [Choose a mechanism](/customize/chooser/).

## When to use what

| Need | Use |
|------|-----|
| Short always-on repo rules (3–7 bullets) | Root `AGENTS.md` |
| Personal cross-project preferences | `~/.ciro/AGENTS.md` |
| Path-scoped conventions (e.g. only `*.tsx`) | `.ciro/rules/*.md` |
| Long, on-demand playbooks | Skill (`SKILL.md`) |

## AGENTS.md

Root `AGENTS.md` loads as project-level instructions. Write **short, enforceable rules**—not an entire design doc.

```markdown
# AGENTS.md

- Public API changes must update tests
- Never commit `.env` or secrets
- Prefer editing `src/`; leave generated dirs alone
```

Global preferences live in `~/.ciro/AGENTS.md`.

## Rules

### Locations

| Scope | Path |
|-------|------|
| Project (commit these) | `{workspace}/.ciro/rules/**/*.md` |
| User | `~/.ciro/rules/**/*.md` |

### Format

Markdown with frontmatter. **Empty / omitted `globs`** → always-on; **with `globs`** → injected only when the message has matching path tokens.

```markdown
---
description: React component conventions
globs: ["src/components/**/*.tsx", "src/hooks/**/*.ts"]
---

# React

1. Props need an explicit TypeScript interface; no `any`
2. Prefer Tailwind; avoid inline style objects
3. `useEffect` must list dependencies and clean up on unmount
```

## Skills

Skills are **on-demand** playbooks: a folder with `SKILL.md` (or a single `.md` file). Metadata lives in **frontmatter** (there is no separate `meta.json`).

### Locations

- Project: `{workspace}/.ciro/skills/<name>/SKILL.md`
- User: `~/.ciro/skills/`

### Example

```text
.ciro/skills/review/
└── SKILL.md
```

```markdown
---
name: review
description: Review diffs and test risk
triggers: [@review]
requiresMcp: []
---

# Review

1. List changed files and risks
2. Call out missing tests
3. Do not edit code unless the user asks
```

| Field | Meaning |
|-------|---------|
| `name` | Skill id (defaults to folder name) |
| `description` | Short summary; used in matching |
| `triggers` | e.g. `[@review]`; single-file skills without triggers default to `@name` |
| `requiresMcp` | Session must have these MCP ids enabled or the skill is skipped |

Invoke with trigger tokens (e.g. `@review`) or slash-style usage depending on the build. Injection is token-budgeted—keep Skills lean.

## Practice

1. Keep Rules short and strict; put detail in `@` files or Skills  
2. Add `globs` only when path-specific; avoid always-on noise  
3. Commit team norms in `.ciro/rules/` and `AGENTS.md`  
4. Need external tools → [MCP](/guides/mcp/); need an official workbench capability (e.g. Git) → [Packs](/guides/packs/)

## What's next

[Choose a mechanism](/customize/chooser/) · [MCP](/guides/mcp/) · [Security](/trust/security/)
