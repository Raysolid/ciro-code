---
title: Configuration Reference
description: Priority cascade, file locations, and production-ready .ciro/config.yaml reference.
---

Ciro Code uses a hierarchical configuration architecture. This page outlines configuration precedence, file locations, and a complete `.ciro/config.yaml` reference.

---

## Configuration Precedence

When the same field is configured at multiple levels, **later layers override earlier ones**:

```text
[1. Built-in Defaults]
          ↓
[2. User Global Config] (~/.ciro/config.yaml & credentials/)
          ↓
[3. Workspace Project Config] ({workspace}/.ciro/config.yaml)
          ↓
[4. Environment Variables] (DEEPSEEK_API_KEY, CIRO_PORT, etc.)
          ↓
[5. CLI Command Flags] (--mode, -w, -p, etc.)
```

1. **Built-in Defaults**: Out-of-the-box security defaults and fallback ports.
2. **User Global Config**: Stored in `~/.ciro/`, shared across all local projects (credentials, global preferences).
3. **Workspace Project Config**: Stored in `{workspace}/.ciro/config.yaml` (recommended to check into Git), establishing team safety baselines.
4. **Environment Variables**: Variables exported in the current shell session.
5. **CLI Flags**: Explicit command-line arguments, carrying highest precedence.

---

## Annotated Configuration Template (`.ciro/config.yaml`)

Recommended template to drop into your workspace root:

```yaml
# {workspace}/.ciro/config.yaml
# Ciro Code Workspace Baseline Configuration

# 1. Default working mode (ask | plan | agent | debug)
mode: agent

# 2. Security policies and sandboxing
permissions:
  # Preset level: workspace-readonly | plan-readonly | workspace-write | debug-instrument
  preset: workspace-write

  # File system path access boundaries (workspace-relative globs)
  fs:
    allow:
      - "src/**"
      - "tests/**"
      - "package.json"
      - "tsconfig.json"
      - "README.md"
    deny:
      - ".env*"
      - "*.pem"
      - "deploy/production/**"
      - "secrets/**"

  # Controlled Shell command execution
  shell:
    # Auto-approved commands (prefix or glob pattern)
    allowlist:
      - "git status"
      - "git diff*"
      - "git log*"
      - "npm test*"
      - "pnpm test*"
      - "npm run build"
      - "npx eslint *"
      - "cargo check*"
    # Strictly prohibited commands (always blocked)
    deny:
      - "rm -rf *"
      - "curl *"
      - "wget *"
      - "Invoke-WebRequest *"
      - "drop database *"
    # Command execution timeout (seconds, default 60)
    timeoutSeconds: 60

# 3. Native tools to expose (omit to let mode manage tools)
tools:
  - read
  - edit
  - write
  - list_files
  - grep
  - bash

# 4. Workbench server preferences
server:
  port: 5280
  openBrowser: true
```

---

## Common Environment Variables

| Variable | Description | Equivalent CLI / Config |
|----------|-------------|-------------------------|
| `DEEPSEEK_API_KEY` | DeepSeek inference key | DeepSeek key in Settings |
| `OPENAI_API_KEY` | OpenAI inference key | OpenAI key in Settings |
| `ANTHROPIC_API_KEY`| Anthropic Claude inference key | Claude key in Settings |
| `CIRO_PORT` | Local Web Workbench port | `-p, --port` |
| `CIRO_TUI_MINIMAL` | Terminal TUI inline streaming output | `--minimal` |

---

## Configuration Inspection Commands

Inspect and validate effective configurations with CLI commands:

```bash
# Print effective configuration with source origin per field
ciro config show -w .

# Output merged configuration as JSON
ciro config effective -w .

# Validate syntax and schema of .ciro/config.yaml
ciro config validate -w .

# Interactive wizard to generate starter config
ciro config wizard -w .
```

---

## Next Steps

- [Permissions & Sandboxing](/guides/permissions/)
- [Providers & Models Connection](/customize/providers-models/)
- [CLI Reference](/reference/cli/)
