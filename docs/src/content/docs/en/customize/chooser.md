---
title: Choose a mechanism
description: Pick the smallest customization that fits—AGENTS, Rules, Skills, MCP, or official Packs.
---

Start with the **smallest mechanism that works**, then layer heavier extensions. If it fits in `AGENTS.md`, you do not need a Pack first.

## Decision table

| Need | Start with | Notes |
|------|------------|-------|
| Persistent repo conventions (style, tests, hard no's) | `AGENTS.md` or `.ciro/rules` | Visible every relevant session; keep them short and strict |
| Long, reusable task playbooks (load on demand) | [Skill](/guides/rules-skills/) | Injected when the description matches—saves context |
| External systems (issues, browser, internal APIs) | [MCP](/guides/mcp/) | New tools for the agent without forking the kernel |
| Official workbench capabilities (e.g. Git panel) | [Feature Pack](/guides/packs/) | Install from npm; enable in Settings |
| Different inference backend or model | [Connect a model](/getting-started/first-provider/) · [Providers & models](/customize/providers-models/) | Orthogonal to mode: mode gates tools; model reasons |

## Suggested order

```text
AGENTS.md / Rules  →  Skills  →  MCP  →  official Packs
```

1. Put three to seven always-on rules in root `AGENTS.md`  
2. Extract repeated long workflows into Skills  
3. Add MCP when you need systems outside the repo  
4. Install an official Pack only when you need that product capability  

## Anti-patterns

- Shipping a Pack only to inject a prompt → use Rules / Skills  
- Using MCP instead of local `git` / test commands → rely on shell + allowlists first  
- Pasting an entire design doc into `AGENTS.md` → keep rules short; detail via `@` files or Skills  

## Related pages

- [Rules & skills](/guides/rules-skills/)  
- [MCP tools](/guides/mcp/)  
- [Feature packs](/guides/packs/)  
