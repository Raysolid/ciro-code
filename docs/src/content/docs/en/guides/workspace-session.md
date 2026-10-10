---
title: Workspace & sessions
description: Workspaces, recent folders, and where data is stored.
---

## Workspace

The workspace is the project root Ciro Code can read and (depending on mode) edit. Pick it in the UI or pass `-w`:

```bash
ciro web -w /path/to/project
```

Recent workspaces are restored on the next launch when you omit `-w` (if the folder still exists).

## Sessions

- A session is created when you send the **first** message.
- Empty sessions are cleaned up on startup.
- History is stored locally under the product directories (see below).

## On-disk layout (user-facing)

| Path | Purpose |
|------|---------|
| `{workspace}/.ciro/` | Project config, memory, rules, plans |
| `~/.ciro/` | User config, credentials, packs, sessions |

Legacy `.pi` / `~/.pi/agent` paths may still be readable during migration. Use `ciro doctor` and `ciro migrate` if you have old data — see [CLI](/reference/cli/).
