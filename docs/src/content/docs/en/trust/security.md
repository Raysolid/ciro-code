---
title: Security
description: Local boundary, credentials, egress, and vulnerability reporting.
---

Ciro Code is **local-first**: secrets and sessions stay on your machine; egress is mainly models and tools you enable. This page is the trust hub; details live in linked docs.

## What you can expect

| Promise | Meaning |
|---------|---------|
| No Ciro cloud edit proxy | The product does not upload your repo to a hosted service to edit it |
| Keys stay local | Under `~/.ciro/credentials/` and related paths |
| Modes gate tools | Ask/Plan lean read-only; Agent/Debug can write with approvals |
| Auditable kernel | MIT scope in [What is open source](/open-core/what-is-open/) |

## Credentials

| Location | Purpose |
|----------|---------|
| `~/.ciro/credentials/` | Stored API keys |
| `~/.ciro/providers.json` | Provider config (no plaintext keys) |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | Optional environment defaults |

Configure day to day via [Providers & models](/customize/providers-models/) or [Connect a model](/getting-started/first-provider/).  
**Never** commit real keys or paste them into public issues.

## Permissions and approvals

- Presets and allowlists: [Permissions](/guides/permissions/)  
- Mode boundaries: [Modes](/guides/modes/)  
- Sensitive shell / out-of-tree paths prompt for Allow once / Always allow / Deny

## Data and egress

- On disk: `~/.ciro/` and `{workspace}/.ciro/` — [Data & privacy](/concepts/data-and-privacy/)  
- Outbound: LLMs you configure; plus MCP / WebFetch you enable  
- `ciro web --mock` does **not** call a real model provider

## Extension trust

Install only official Feature Packs and MCP servers you trust; install ≠ enable. See [Choose a mechanism](/customize/chooser/) · [Feature packs](/guides/packs/) · [MCP](/guides/mcp/).

## Report a vulnerability

Report **privately** via GitHub [Security Advisories](https://github.com/Raysolid/ciro-code/security/advisories/new).  
Full policy: [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md).  
Fixes target the latest npm `@ciro-code/code` / `@ciro-code/cli`—upgrade before filing issues that may already be resolved.

## What's next

- [Permissions](/guides/permissions/) · [What is open source](/open-core/what-is-open/) · [Troubleshooting](/guides/troubleshooting/)
