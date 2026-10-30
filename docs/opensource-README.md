# Ciro Code

Local coding agent harness — policy-aware tools, session memory, and a streaming HTTP API you can run on your machine.

## Install (npm)

Full product experience (Web workbench + four-mode profiles) ships via npm. The packages are equivalent:

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

## Open Core

This repository is the **open Kernel** (shared types, core policy/session, Pi/Mock runtime, HTTP+SSE API, CLI, official Git pack).

| Surface | In this repo? |
|---------|----------------|
| Kernel + CLI + `ext-git` | Yes (MIT) |
| Web UI source | No — shipped as built assets with the npm CLI |
| Four-mode Profile source | No — product profiles ship with the npm CLI |

Clone this repo to study or extend the Kernel. Install `@ciro-code/code` for the complete Ciro Code workbench.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io) 9+ (for building from source)

## Build from source

```sh
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build

# Mock agent (no API key) — API-only if UI assets are not present
pnpm run dev:web:mock

# Or with a real model
pnpm run dev:web
```

Health check: [http://127.0.0.1:3080/health](http://127.0.0.1:3080/health)

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
  ext-git/              # Official Git Feature Pack
examples/               # Starter workspaces (`ciro init --example …`)
profiles/               # Optional config overlays
```

## Development

```sh
pnpm install
pnpm run build
pnpm test
```

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build all packages |
| `pnpm run dev:web:mock` | Local API with Mock agent |
| `pnpm run dev:web` | Local API with Pi / LLM |
| `pnpm test` | Run workspace tests |

## License

[MIT](./LICENSE)
