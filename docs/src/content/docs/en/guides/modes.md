---
title: Modes
description: Ask, Plan, Agent, and Debug—what each mode allows and when to use it.
---

**Mode** and **model** are separate:

- **Mode** — which tools are allowed and whether files may be written (Harness)  
- **Model** — who reasons (**Settings → Models**)

## Comparison

| Mode | Intent | Typical tools | You should check |
|------|--------|---------------|------------------|
| **Ask** | Explore architecture and docs | `read`, `list_files`, `grep`, read-scoped `bash`, `WebFetch` | No writes; Changes stays empty |
| **Plan** | Design steps before editing | Ask tools + plan tools; source edits blocked | Review phases and blast radius |
| **Agent** | Implement and verify | `edit`, `write`, allowlisted `bash` | Review Diffs in Changes; approve when prompted |
| **Debug** | Fix failures with minimal blast radius | Read/write/edit + focused probes | Stay on the failing hypothesis |

## Recommended lifecycle

```text
Ask → Plan → Agent → Debug (as needed)
```

1. **Ask** — map the codebase without risk  
2. **Plan** — get a structured plan; files stay write-protected  
3. **Agent** — implement under sandbox + allowlist  
4. **Debug** — if tests fail, supply the stack and ask for a minimal patch  

## How to switch

- Web: mode tabs in the header  
- Keyboard: `Shift+Tab`  
- Slash: `/mode ask|plan|agent|debug`  
- CLI: `ciro web --mode ask`  
- Workspace default: `mode: ask` in `{workspace}/.ciro/config.yaml`

## What's next

[Permissions](/guides/permissions/) · [Explore a codebase](/workflows/explore-codebase/) · [Plan a change](/workflows/plan-a-change/) · [How it works](/concepts/how-it-works/)
