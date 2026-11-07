---
title: Shortcuts
description: Common shortcuts and input conventions for Web and TUI.
---

Details may shift by release; prefer in-app `/help` and footer hints when they differ.

## Shared input conventions

| Input | Action |
|-------|--------|
| `@` | Search and mention a workspace file |
| `/` | Open slash commands (for example `/help`) |
| `Shift+Tab` | Cycle modes (Ask → Plan → Agent → Debug) |
| `Esc` | Stop the current turn / cancel in-flight generation |

Composer placeholders usually look like: `Message Ciro… /commands · @files`.

## Terminal TUI

| Key / command | Action |
|---------------|--------|
| `Shift+Tab` | Switch mode |
| `/help` | Commands and shortcut help |
| `@` | Mention files |
| `Esc` | Stop |

Footer hint often reads: `Shift+Tab:mode | /:commands | @:files | Esc:stop`.

Resume sessions:

```bash
ciro --continue
ciro --resume <session-id>
```

## Web workbench

| Action | Purpose |
|--------|---------|
| Mode tabs | Switch Ask / Plan / Agent / Debug |
| `@` / `/` in the composer | Same as the shared table |
| **Changes** tab | Review Agent diffs |
| Settings | Providers, permissions, MCP, packs |

Browser shortcuts (copy, find, …) follow the OS and browser.

## Related

- [Web workbench](/surfaces/web-workbench/) · [Terminal UI](/surfaces/terminal-tui/) · [Modes](/guides/modes/) · [CLI](/reference/cli/)
