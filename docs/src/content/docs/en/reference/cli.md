---
title: CLI
description: ciro command reference.
---

```bash
ciro --help
ciro -V
```

## `ciro web`

Start the local workbench server.

| Option | Description |
|--------|-------------|
| `-w, --workspace <path>` | Workspace root (omit to restore last recent) |
| `-p, --port <number>` | Port (default `3080`) |
| `--mode <mode>` | Initial mode: `ask` \| `plan` \| `agent` \| `debug` |
| `--profile <id>` | Profile overlay (for example `developer`) |
| `--no-open` | Do not open a browser |
| `--mock` | Mock agent (no API key) |

```bash
ciro web
ciro web --mock --no-open
ciro web -w . -p 3080 --mode ask
```

## `ciro pack`

Official Feature Packs.

```bash
ciro pack add @ciro-code/ext-git
ciro pack list
ciro pack remove @ciro-code/ext-git
```

Install does **not** enable the pack — use Settings → Feature packs.

## `ciro init`

Copy a starter example workspace.

```bash
ciro init --example react-ts
ciro init --example node-api -d ./my-app --force
```

## `ciro config`

| Subcommand | Description |
|------------|-------------|
| `show` | Effective config with sources (`-w`, `--mode`, `--profile`) |
| `effective` | Effective config JSON |
| `validate` | Validate effective config |
| `wizard` | Print a recommended starter `config.yaml` |

```bash
ciro config show -w .
ciro config validate -w .
```

## `ciro doctor`

Check `.ciro` / legacy `.pi` product directories.

```bash
ciro doctor -w .
```

## `ciro migrate`

Copy legacy `.pi` / `~/.pi/agent` data into `.ciro` / `~/.ciro` (does not delete old files).

```bash
ciro migrate
ciro migrate -w .
```

## `ciro debug`

Print environment, config, smoke-related fields, and recent audit entries.

```bash
ciro debug -w .
```
