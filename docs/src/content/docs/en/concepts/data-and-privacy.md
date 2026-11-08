---
title: Data & privacy
description: Where config and sessions live, and what leaves your machine.
---

Ciro Code is **local-first**: work products stay on disk by default; egress is mainly inference to providers you configure.

## On-disk locations

| Path | Contents |
|------|----------|
| `~/.ciro/` | User config, credentials, packs, session dir `sessions/`, cross-project preferences |
| `{workspace}/.ciro/` | Workspace config, rules, memory, plans, and related project state |

API keys stay on your machine (user config or environment variables). They are **not** relayed through a Ciro cloud proxy.

## What leaves the machine

- **Does**: inference requests to LLM providers you enabled (payload scope depends on the model and task)  
- **Does not (by design)**: upload the whole repo to a Ciro-hosted editing service—the product has no such proxy  
- **Tools**: explicit network tools such as WebFetch run only when policy allows and the task needs them  

For presets and shell gates, see [Permissions](/guides/permissions/).

## Open source and disclosure

The execution kernel and CLI are MIT-licensed so you can audit the local boundary. Scope: [What is open source](/open-core/what-is-open/).  
Trust hub and vulnerability reporting: [Security](/trust/security/).

## What's next

- Mental model: [How it works](/concepts/how-it-works/)  
- Presets and approvals: [Permissions](/guides/permissions/)  
- Model setup: [Providers & models](/customize/providers-models/)  
