---
title: Feature packs
description: Install and enable official workbench Feature Packs.
---

Official Feature Packs add optional workbench capabilities such as a Git panel.  
For prompts only, see [Rules / Skills](/guides/rules-skills/). For external systems, see [MCP](/guides/mcp/). Selection guide: [Choose a mechanism](/customize/chooser/).

## Principles

| Principle | Meaning |
|-----------|---------|
| User-level install | `~/.ciro/packs/`—never pollutes project `package.json` |
| Install ≠ enable | Turn on explicitly in **Settings → Feature packs** |
| Official ids | For example `@ciro-code/ext-git` |
| Still sandboxed | Runtime I/O follows [permissions](/guides/permissions/) |

Install only official packs you trust.

## Install and manage

```bash
ciro pack add @ciro-code/ext-git
ciro pack list
ciro pack remove @ciro-code/ext-git
```

From a local checkout of an official pack (same id):

```bash
ciro pack add @ciro-code/ext-git --from ./packages/ext-git
```

`list` shows version and enabled state.

## Enable in the workbench

1. `ciro web`  
2. **Settings → Feature packs**  
3. Toggle on (e.g. `@ciro-code/ext-git`)  
4. Refresh if prompted, then use the new panel

## Success looks like

- `ciro pack list` shows the package  
- Settings can toggle it; enabling reveals UI

## If it fails

- Command missing → [Install](/getting-started/install/)  
- Enabled but no UI → confirm the toggle and refresh; check the terminal  
- You only needed prompts → use Rules / Skills instead

## What's next

[Web workbench](/surfaces/web-workbench/) · [Security](/trust/security/) · [CLI](/reference/cli/)
