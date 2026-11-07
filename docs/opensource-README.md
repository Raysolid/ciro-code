# Ciro Code

Local coding agent harness — policy-aware tools, session memory, and a streaming HTTP API you can run on your machine.

## Install (npm)

```bash
npm install -g @ciro-code/code
# same as: npm install -g @ciro-code/cli

ciro --help
ciro web                 # prints Ciro banner + URLs, opens the workbench
ciro web --mock --no-open  # smoke / CI without opening a browser
```

Works the same on **Windows** (pwsh recommended) and **macOS**. For a real model, set `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` or configure providers in settings.

### Feature Packs

```bash
ciro pack add @ciro-code/ext-git   # install from npm (not enabled yet)
ciro pack list
# then enable in Settings → Feature packs
```

## Open source (MIT)

This repository publishes the **open Kernel**:

| Component | Notes |
|-----------|-------|
| Core Kernel | Policy sandbox, memory, context composer |
| CLI (`ciro`) | Mode routing, doctor, pack manager |
| HTTP + SSE API | Local harness server |
| Extensibility | Rules, Skills, MCP configuration |

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io) 9+ (for building from source)

## Build

```sh
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build
pnpm run dev:web:mock
# or: pnpm run dev:web
```

Health check: [http://127.0.0.1:5280/health](http://127.0.0.1:5280/health)

```sh
pnpm --filter @ciro-code/cli exec node dist/cli.js --help
pnpm --filter @ciro-code/cli exec node dist/cli.js web --mock --no-open -w .
```

## Repository layout

```
apps/ciro-cli/          # `ciro` CLI
apps/ciro-code/         # `@ciro-code/code` meta (forwards to CLI)
packages/
  shared/               # Shared types & contracts
  harness-core/         # Config, policy, memory, skills, session
  harness-pi/           # Agent runtime (Pi + Mock)
  harness-web/          # Hono HTTP + SSE API
examples/               # Starter workspaces (`ciro init --example …`)
```

## Development

```sh
pnpm install
pnpm run build
pnpm test
```

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build open packages |
| `pnpm run dev:web:mock` | Local API with Mock agent |
| `pnpm run dev:web` | Local API with Pi / LLM |
| `pnpm test` | Run workspace tests |

## License

[MIT](./LICENSE)
