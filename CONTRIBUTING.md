# Contributing

Thanks for helping improve Ciro Code. This repository is the **open Kernel** (shared types, policy/session, Pi/Mock runtime, HTTP+SSE API, CLI, and official `ext-git`). The Web workbench UI and official four-mode Profiles ship as npm artifacts and are not developed in this tree.

## Requirements

- Node.js **20+**
- [pnpm](https://pnpm.io) **9+**
- On Windows, prefer **PowerShell 7 (`pwsh`)**

## Develop from source

```bash
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build
pnpm run dev:web:mock
```

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build all packages |
| `pnpm run dev:web:mock` | Local API with Mock agent (no API key) |
| `pnpm run dev:web` | Local API with a real model |
| `pnpm test` | Workspace tests |

Health check: [http://127.0.0.1:3080/health](http://127.0.0.1:3080/health)

End users who only need the workbench should install from npm:

```bash
npm install -g @ciro-code/code
ciro web
```

## Pull requests

1. Keep changes focused on the Kernel / CLI / open packs.
2. Add or update tests when behaviour changes.
3. Do not commit secrets, real API keys, or private project content.
4. Match existing code style; avoid drive-by refactors.

## Docs site

User-facing guides live under `docs/` (Starlight) and publish to [raysolid.github.io/ciro-code](https://raysolid.github.io/ciro-code/docs/en/). Prefer fixing docs in the same PR when you change public behaviour (modes, presets, CLI flags).

## Security

Report vulnerabilities **privately** via [GitHub Security Advisories](https://github.com/Raysolid/ciro-code/security/advisories/new). See [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
