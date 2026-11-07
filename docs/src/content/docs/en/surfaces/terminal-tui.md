---
title: Terminal UI (TUI)
description: Run fullscreen sessions with ciro / ciro tui.
---

Stay in the terminal with the fullscreen TUI. The default command is TUI: `ciro` and `ciro tui` are equivalent.

## Start

From a project root (or pass `-w`):

```bash
ciro
ciro tui -w /path/to/project
ciro --mode ask --mock
ciro --continue              # resume the most recent session
ciro --resume <session-id>   # resume a specific session
```

Common flags: `--mode`, `--mock`, `--profile`, `--minimal` (no alternate screen; or `CIRO_TUI_MINIMAL=1`).

## What you do inside

- Type natural-language tasks; `@` to mention files; `/` for commands (for example `/help`)
- `Shift+Tab` cycles modes (Ask / Plan / Agent / Debug)
- `Esc` stops the current turn
- Tool calls and replies stream in the same session

Full table: [Shortcuts](/reference/shortcuts/).

## vs Web

| Capability | TUI | Web |
|------------|-----|-----|
| Modes / permissions / workspace policy | ✓ | ✓ |
| Fullscreen session, `--continue` | ✓ | Session list in the sidebar |
| Side-by-side Changes, Settings UI | Limited / none | ✓ |
| Graphical provider / pack setup | Limited | ✓ |

For careful diff review or provider setup, open the [Web workbench](/surfaces/web-workbench/) (`ciro web`). Avoid conflicting concurrent instances on the same workspace unless you intentionally use CLI `--allow-concurrent` / `--local`.

## Success looks like

- A fullscreen session shows the current mode and workspace
- `/help` lists commands; Ask tasks leave the repo unchanged

## What's next

- [Quickstart](/getting-started/quickstart/) (Web-first) · [Modes](/guides/modes/) · [Explore a codebase](/workflows/explore-codebase/)
