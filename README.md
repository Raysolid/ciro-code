# Ciro Code

Ciro Code is a local coding agent with a Web workbench. It understands your workspace, runs tools under a policy sandbox, and supports Ask / Plan / Agent / Debug modes.

Requires **Node.js 20+**.

**Docs:** [raysolid.github.io/ciro-code/docs](https://raysolid.github.io/ciro-code/docs/)

## Get started

```bash
npm install -g @ciro-code/code
ciro web
```

The CLI binary is `ciro`. On Windows, prefer **pwsh**:

```powershell
npm install -g @ciro-code/code
ciro web
```

Workbench: [http://127.0.0.1:3080](http://127.0.0.1:3080) · health check: `/health`.

Configure a model via Settings, or set `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`. To try the UI without a key:

```bash
ciro web --mock
```

> Install the scoped package `@ciro-code/code` (or `@ciro-code/cli`). Do not use `npm i -g ciro`.

## Usage

```bash
ciro --help
ciro web                    # start workbench (opens browser)
ciro web --mock             # no API key
ciro web --mock --no-open   # smoke / CI
ciro web -w <workspace>     # set workspace
ciro pack add @ciro-code/ext-git
```

## Development

```bash
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build
pnpm run dev:web:mock    # local API + mock agent
# pnpm run dev:web       # real model (needs API key)
```

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build all packages |
| `pnpm run dev:web:mock` | Local server with mock agent |
| `pnpm run dev:web` | Local server with a real model |
| `pnpm test` | Run tests |

```
apps/ciro-cli/       # CLI
packages/
  shared/            # Shared types & contracts
  harness-core/      # Config, policy, memory, skills, session
  harness-pi/        # Agent runtime
  harness-web/       # HTTP + SSE API
  ext-git/           # Git feature pack
examples/            # Starter workspaces
```

## Security & agents

- Security policy: [SECURITY.md](./SECURITY.md)
- Install guidance for coding agents: [AGENTS.md](./AGENTS.md)

## License

[MIT](./LICENSE) · npm [@ciro-code/code](https://www.npmjs.com/package/@ciro-code/code)
