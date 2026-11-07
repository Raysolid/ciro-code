---
title: Config
description: Config locations, merge precedence, and how to inspect effective values.
---

## Precedence (later wins)

For the same keys, layers merge in this order—**later overrides earlier**:

1. Built-in defaults  
2. User config — `~/.ciro/config.yaml` (plus `providers.json`, `credentials/`, …)  
3. Workspace config — `{workspace}/.ciro/config.yaml`  
4. Environment — e.g. `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `CIRO_AGENT_BACKEND`, `CIRO_PORT`  
5. CLI flags — e.g. `--mode`, `--profile`, `-w`, `-p`

Inspect effective config and sources:

```bash
ciro config show -w .
ciro config effective -w .
ciro config validate -w .
```

## Locations

| Layer | Path / source |
|-------|----------------|
| User | `~/.ciro/` |
| Workspace | `{workspace}/.ciro/` |
| Environment | Shell environment variables |
| CLI | `ciro` / `ciro web` options |

Directory meaning: [Data & privacy](/concepts/data-and-privacy/) · [Workspace & sessions](/guides/workspace-session/).

## Starter snippet

```bash
ciro config wizard -w .
```

Example (read-only start):

```yaml
mode: ask
tools: [read, list_files, grep]
permissions:
  preset: workspace-readonly
```

Switch to Agent when you want edits (`mode: agent`, write tools, write preset). Prefer the workbench **Settings** UI for day-to-day changes.

## Port

Web defaults to port **5280** (avoids some Windows reserved ranges). Override with `-p` or `CIRO_PORT`.

## Credentials

See [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md). Never commit secrets.
