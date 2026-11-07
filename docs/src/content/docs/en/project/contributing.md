---
title: Open Kernel
description: Build and study the MIT-licensed Kernel and CLI from the public repository.
---

Source: [github.com/Raysolid/ciro-code](https://github.com/Raysolid/ciro-code)

This repository holds the **open Kernel**: shared types, policy/session, agent runtime, HTTP+SSE API, CLI, plus Rules / Skills / MCP plumbing and tests. Scope: [What is open source](/open-core/what-is-open/). Product install: [Install](/getting-started/install/).

## Build

Requires **Node.js 20+** and **pnpm 9+**.

```bash
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build
pnpm test
```

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build open packages |
| `pnpm run dev:web:mock` | Local API + mock agent |
| `pnpm run dev:web` | Local API + a real model |
| `pnpm test` | Tests |

Smoke the CLI:

```bash
pnpm --filter @ciro-code/cli exec node dist/cli.js --help
pnpm --filter @ciro-code/cli exec node dist/cli.js web --mock --no-open -w .
```

Health check default: [http://127.0.0.1:5280/health](http://127.0.0.1:5280/health).

## License & security

- [MIT License](https://github.com/Raysolid/ciro-code/blob/main/LICENSE)
- [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md) — vulnerability reporting and credential locations
