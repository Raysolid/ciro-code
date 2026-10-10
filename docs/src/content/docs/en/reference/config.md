---
title: Config
description: Where configuration lives and how it merges.
---

## Locations

| Layer | Path |
|-------|------|
| Environment | `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `CIRO_AGENT_BACKEND`, … |
| User | `~/.ciro/config.yaml`, `providers.json`, `credentials/` |
| Workspace | `{workspace}/.ciro/config.yaml` |
| CLI | Flags such as `--mode`, `--profile`, `-w` |

Later layers override earlier ones for the same keys (effective config). Inspect with:

```bash
ciro config show -w .
ciro config effective -w .
```

## Starter snippet

```bash
ciro config wizard -w .
```

Example themes:

```yaml
mode: ask
tools: [read, list_files, grep]
permissions:
  preset: workspace-readonly
```

Switch to agent when you want edits (`mode: agent`, write tools, write preset). Prefer editing via Settings when possible.

## Credentials

See [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md). Never commit secrets.
