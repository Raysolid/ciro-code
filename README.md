<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/logo-dark.png" />
  <img src="assets/readme/logo.png" alt="Ciro Code" width="320" />
</picture>

**The local-first coding agent with a Web workbench.**

Ask · Plan · Agent · Debug · visible permissions · reviewable diffs.  
Your code goes only to the model endpoint *you* configure — no Ciro cloud proxy.

[![npm](https://img.shields.io/npm/v/@ciro-code/code?style=flat-square&label=npm&color=cb3837)](https://www.npmjs.com/package/@ciro-code/code)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A5%2020-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

[Documentation](https://raysolid.github.io/ciro-code/docs/en/) ·
[Website](https://raysolid.github.io/ciro-code/) ·
[npm](https://www.npmjs.com/package/@ciro-code/code) ·
[Security](./SECURITY.md)

**English** | [简体中文](./README.zh-CN.md)

</div>

---

<div align="center">
  <img src="assets/readme/hero-workbench.png" alt="Ciro Code workbench" width="920" />
</div>

## Quick start

**Requirements:** Node.js **20+** · Windows (pwsh recommended), macOS, or Linux.

```bash
npm install -g @ciro-code/code
# same binary: npm install -g @ciro-code/cli

ciro web                    # → http://127.0.0.1:3080
ciro web --mock             # explore UI without an API key
ciro web -w . --mode ask    # pin a workspace, start read-only
```

Set `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`, or add a provider under **Settings → Models**.

More: [Quickstart](https://raysolid.github.io/ciro-code/docs/en/getting-started/quickstart/) · [Connect a model](https://raysolid.github.io/ciro-code/docs/en/getting-started/first-provider/) · [Troubleshooting](https://raysolid.github.io/ciro-code/docs/en/guides/troubleshooting/)

## Build from source

This repository is the **open Kernel** (policy, session, Pi/Mock runtime, HTTP+SSE API, CLI, `ext-git`). The Web UI and official four-mode Profiles ship as npm artifacts.

```bash
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install
pnpm run build

pnpm run dev:web:mock   # Mock agent (no API key)
pnpm run dev:web        # real model
pnpm test
```

Requires Node.js 20+ and pnpm 9+. Details: [CONTRIBUTING.md](./CONTRIBUTING.md) · [What is open source](https://raysolid.github.io/ciro-code/docs/en/open-core/what-is-open/)

## Documentation

| | |
| :-- | :-- |
| Getting started | [Overview](https://raysolid.github.io/ciro-code/docs/en/getting-started/overview/) · [Install](https://raysolid.github.io/ciro-code/docs/en/getting-started/install/) · [Quickstart](https://raysolid.github.io/ciro-code/docs/en/getting-started/quickstart/) |
| Guides | [Modes](https://raysolid.github.io/ciro-code/docs/en/guides/modes/) · [Permissions](https://raysolid.github.io/ciro-code/docs/en/guides/permissions/) · [MCP](https://raysolid.github.io/ciro-code/docs/en/guides/mcp/) · [Packs](https://raysolid.github.io/ciro-code/docs/en/guides/packs/) |
| Reference | [CLI](https://raysolid.github.io/ciro-code/docs/en/reference/cli/) · [Config](https://raysolid.github.io/ciro-code/docs/en/reference/config/) |
| Agents / CI | [`AGENTS.md`](./AGENTS.md) |

## Contributing & license

Bug reports and ideas: [GitHub Issues](https://github.com/Raysolid/ciro-code/issues).  
Kernel / CLI changes: [CONTRIBUTING.md](./CONTRIBUTING.md).  
Vulnerabilities: report **privately** via [Security advisories](https://github.com/Raysolid/ciro-code/security/advisories/new) — see [SECURITY.md](./SECURITY.md).

Kernel, CLI, and official Git pack: [MIT](./LICENSE). Web UI and official Profiles ship as npm build artifacts.
