---
title: What is open source
description: MIT-licensed surface, what you can audit, and our local-data commitment.
---

Ciro Code’s **Kernel** and **CLI** are open source under MIT. You can audit local execution, the policy sandbox, and the HTTP/SSE API. We commit that your local data stays on your machine and is never uploaded without your permission.

## What is open (MIT)

| Component | Notes |
|-----------|-------|
| **Core Kernel** | Policy sandbox, memory, context composer |
| **CLI (`ciro`)** | Mode routing, doctor, pack manager commands |
| **HTTP + SSE API** | Local harness server |
| **Extensions you can author** | Rules, Skills, MCP configuration |

Source: [GitHub](https://github.com/Raysolid/ciro-code).

Inference connects directly to the LLM provider you configure—your code and API keys never pass through a Ciro cloud proxy.

## What this means for you

- **Audit the execution path** — Kernel and CLI sources are public under MIT.
- **Customize with open mechanisms** — [Rules / Skills / MCP](/customize/chooser/).
- **Keys stay local** — credentials under `~/.ciro/`; see [Permissions](/guides/permissions/) and [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md).
- **Day-to-day use** — [Install](/getting-started/install/); official packs: [Feature packs](/guides/packs/).

## Contribute

Study or change the open Kernel / CLI: [Open Kernel](/project/contributing/).
