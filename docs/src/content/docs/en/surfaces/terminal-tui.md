---
title: Terminal UI
description: Run fullscreen sessions with `ciro` / `ciro tui`.
---

The default subcommand is the fullscreen TUI. `ciro` and `ciro tui` are equivalent.

## Start

From a project root, or pass `-w`:

```bash
ciro
ciro tui -w /path/to/project
ciro --mode ask --mock
ciro --continue              # resume the most recent session
ciro --resume <session-id>   # resume a specific session
```

Common flags: `--mode`, `--mock`, `--profile`, `--minimal`. For no alternate screen, set `CIRO_TUI_MINIMAL=1`.

## Common actions

- Type natural-language tasks; `@` to mention files; `/` for commands such as `/help`
- `Shift+Tab` cycles Ask / Plan / Agent / Debug
- `Esc` stops the current turn
- Tool calls and replies stream in the same session

Full table: [Shortcuts](/reference/shortcuts/).

## vs Web

| Capability | TUI | Web |
|------------|-----|-----|
| Modes / permissions / workspace policy | ✓ | ✓ |
| Fullscreen session, `--continue` | ✓ | Session list in the sidebar |
| Side-by-side Changes, Settings UI | Limited or none | ✓ |
| Graphical provider / pack setup | Limited | ✓ |

For careful diff review or provider setup, use the [Web workbench](/surfaces/web-workbench/): `ciro web`. Avoid conflicting concurrent instances on the same workspace unless you intentionally use `--allow-concurrent` / `--local`.

## Success looks like

- A fullscreen session shows the current mode and workspace
- `/help` lists commands; Ask tasks leave the repo unchanged

## Related pages

[Quickstart](/getting-started/quickstart/) · [Modes](/guides/modes/) · [Explore a codebase](/workflows/explore-codebase/)
