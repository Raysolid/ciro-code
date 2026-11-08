---
title: How it works
description: Local process, workspace, sessions, tool loop, and mode vs model.
---

Ciro Code is an **agentic harness** around a model: the model reasons; local tools read, search, edit, and run commands. After you state a goal, it loops through gathering context, acting, and checking results. You can interrupt or redirect at any time.

Inference goes to providers you configure. There is no Ciro cloud proxy.

## The tool loop

```text
Gather context → Policy check → Sandboxed action → Verify → repeat
```

1. **Gather context** — `read`, `list_files`, `grep`, plus matching [Rules & Skills](/guides/rules-skills/)
2. **Policy check** — [mode](/guides/modes/) and [permissions](/guides/permissions/) decide allow, deny, or approval
3. **Act** — `edit`, `write`, `bash` when allowed, inside the workspace sandbox
4. **Verify** — review diffs, tests, and errors; iterate or wait

A read-only question may stop after step 1. Harder tasks loop many times.

## What it can access

| Resource | Notes |
|----------|-------|
| Workspace files | Current project tree; writes gated by mode and approvals |
| Local shell | Your local command environment via `bash`, allowlist, and approvals |
| Git state | Branch and dirty tree when Git is available |
| Project instructions | Root `AGENTS.md`, `.ciro/rules`, Skills; see [Choose a mechanism](/customize/chooser/) |
| Session history | `~/.ciro/sessions/`; see [Workspace & sessions](/guides/workspace-session/) |

## Built-in tools

| Tool | Role |
|------|------|
| `read` | Read a file |
| `list_files` | List directories |
| `grep` | Search the workspace |
| `bash` | Run a shell command; allowlist and approvals apply |
| `edit` / `write` | Targeted edit or create/overwrite; writable modes only |
| `WebFetch` / `Task` / plan tools | Extra surfaces depending on mode |

## Surfaces and kernel

| Surface | Command | Best for |
|---------|---------|----------|
| Web workbench | `ciro web` | Diffs, settings, packs, longer reviews |
| Terminal UI | `ciro` / `ciro tui` | Fullscreen sessions in the terminal |

## Mode vs model

- **Mode** — which tools are allowed and whether files may be written
- **Model** — who reasons; switch under **Settings → Models**

Do not swap models when you meant to swap modes: explore in Ask; implement in Agent.

## Related pages

[Quickstart](/getting-started/quickstart/) · [Modes](/guides/modes/) · [Permissions](/guides/permissions/) · [Web workbench](/surfaces/web-workbench/) · [Terminal UI](/surfaces/terminal-tui/)
