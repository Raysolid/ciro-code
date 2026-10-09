# Ciro Code

Local coding agent harness — policy-aware tools, session memory, and a streaming HTTP API you can run on your machine.

## Features

- **Modes** — Ask, Plan, Agent, and Debug, with tool allowlists and permission presets per mode
- **Safe by default** — workspace sandbox, shell policy, and approval flows for sensitive commands
- **Persistent sessions** — resume, rewind, and fork chats with event-log backed history
- **Memory & skills** — project rules, facts, and on-demand skill injection with token budgets
- **Extensible** — MCP servers, Feature Packs (start with Git), and a clean Kernel API
- **CLI first** — `ciro web` for the local server; Mock backend for smoke tests without an API key

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io) 9+

## Quick start

```sh
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build

# Mock agent (no API key)
pnpm run dev:web:mock

# Or with a real model — set DEEPSEEK_API_KEY / OPENAI_API_KEY
pnpm run dev:web
```

Health check: [http://127.0.0.1:3080/health](http://127.0.0.1:3080/health)

```sh
pnpm --filter @ciro/cli exec node dist/cli.js --help
pnpm --filter @ciro/cli exec node dist/cli.js web --mock --no-open -w .
```

## Repository layout

```
apps/ciro-cli/          # `ciro` CLI
packages/
  shared/               # Shared types & contracts
  harness-core/         # Config, policy, memory, skills, session
  harness-pi/           # Agent runtime (Pi + Mock)
  harness-web/          # Hono HTTP + SSE API
  ext-git/              # Official Git Feature Pack
examples/               # Starter workspaces (`ciro init --example …`)
profiles/               # Optional config overlays
```

## Development

```sh
pnpm install
pnpm run build
pnpm test
pnpm --filter @ciro/harness-pi test
pnpm --filter @ciro/harness-shared test
```

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build all packages |
| `pnpm run dev:web:mock` | Local API with Mock agent |
| `pnpm run dev:web` | Local API with Pi / LLM |
| `pnpm test` | Run workspace tests |

## License

[MIT](./LICENSE)
