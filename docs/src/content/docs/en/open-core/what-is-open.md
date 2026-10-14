---
title: What is open source
description: Open Core boundaries — what is MIT-licensed, what ships as npm artifacts, and our local-data commitment.
---

The Kernel and CLI are fully open source—you can audit all local execution logic. The Web UI and official Profile ship as npm install artifacts; their source is not open, so we can sustain development and a commercial loop. We commit that your local data stays on your machine and is never uploaded without your permission.

## Open surface vs. shipped artifacts

| Open source (MIT) | npm install artifacts (source not open) |
|-------------------|------------------------|
| **Core Kernel** — policy sandbox, memory, context composer | **Web workbench UI** — local interactive web application |
| **CLI (`ciro`)** — mode routing, doctor, pack manager | **Official Profiles** — curated four-mode workflows |
| **Extensibility specs** — Rules, Skills, MCP integration | |
| **Official Feature Pack** `@ciro-code/ext-git` (also on npm; install ≠ enable) | |

All of the above install and run on your machine. Inference connects directly to the LLM provider you configure—your code and API keys never pass through a Ciro cloud proxy.

## What this means for you

- **Audit the execution path** — Kernel and CLI sources are on [GitHub](https://github.com/Raysolid/ciro-code) under MIT.
- **Use the workbench for free** — install via npm; no subscription is required to run locally. You pay only your own model provider for tokens.
- **Bring your own keys** — credentials stay under `~/.ciro/` on disk; see [Permissions](/guides/permissions/) and [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md).

## Contribute

Want to build from source or propose changes to the open Kernel/CLI? See [Build from source](/project/contributing/).
