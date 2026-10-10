---
title: Contributing
description: Build and develop from the public repository.
---

Source: [github.com/Raysolid/ciro-code](https://github.com/Raysolid/ciro-code)

## Develop from source

Requires **Node.js 20+** and **pnpm 9+**.

```bash
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build
pnpm run dev:web:mock
```

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build packages |
| `pnpm run dev:web:mock` | Local API with mock agent |
| `pnpm run dev:web` | Local API with a real model |
| `pnpm test` | Tests |

End users who only need the workbench should install from npm — see [Install](/getting-started/install/).

## License & security

- [MIT License](https://github.com/Raysolid/ciro-code/blob/main/LICENSE)
- [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md) — vulnerability reporting and credential locations
