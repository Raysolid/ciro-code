---
title: Web workbench
description: Layout, composer, Changes, and settings in the local Web UI.
---

The Web workbench is the everyday surface: review diffs, switch modes, and manage providers or packs in the browser.

## Start

```bash
ciro web
ciro web -w /path/to/project
ciro web --mock          # explore UI without an API key
ciro web --no-open       # do not open a browser
```

Default URL: `http://127.0.0.1:5280` (override with `-p`). Health: `GET /health`.

## UI map

| Area | Purpose |
|------|---------|
| Sidebar | Workspace, session list, new chat |
| Mode bar | Ask · Plan · Agent · Debug |
| Main thread | Thinking, tool calls, replies |
| Right pane | Files, **Changes** (diffs), and related panels |
| Composer | Send messages; `/` commands, `@` file mentions |
| Settings | Providers, permissions, MCP, Feature packs |

Until a workspace is selected, the composer stays locked.

## A typical loop

1. Pick a workspace (UI or `-w`)
2. [Connect a model](/getting-started/first-provider/) when you need inference (or keep `--mock`)
3. Choose a [mode](/guides/modes/) for the risk level
4. Describe the task in the composer; open **Changes** after Agent edits
5. Commit with your local Git workflow (optional Git pack)

## vs terminal UI

| | Web | TUI (`ciro` / `ciro tui`) |
|--|-----|---------------------------|
| Kernel / modes / permissions | Same | Same |
| Diff / settings UI | Richer | Terminal-first |
| Best for | Long reviews, provider setup | Full-screen sessions in the shell |

See [Terminal UI](/surfaces/terminal-tui/) · [Shortcuts](/reference/shortcuts/).

## Success looks like

- The workbench opens with the workspace visible in the sidebar
- The composer accepts messages; Ask tasks leave no project-file diffs
- Agent tasks show edits under Changes

## If it fails

- Port / health issues → [Troubleshooting](/guides/troubleshooting/)
- `ciro` not found → [Install](/getting-started/install/)

## What's next

- [Quickstart](/getting-started/quickstart/) · [Explore a codebase](/workflows/explore-codebase/) · [Implement and verify](/workflows/implement-and-verify/)
