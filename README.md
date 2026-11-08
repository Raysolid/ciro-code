<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/logo-dark.png" />
  <img src="assets/readme/logo.png" alt="Ciro Code" width="320" />
</picture>

**Local-first coding agent with a Web workbench.**

Modes, permissions, and diffs you can see. Inference goes only to endpoints you configure.

[![npm](https://img.shields.io/npm/v/@ciro-code/code?style=flat-square&label=npm&color=cb3837)](https://www.npmjs.com/package/@ciro-code/code)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A5%2020-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

[Docs](https://raysolid.github.io/ciro-code/docs/en/) ·
[Website](https://raysolid.github.io/ciro-code/) ·
[npm](https://www.npmjs.com/package/@ciro-code/code) ·
[Security](./SECURITY.md)

**English** | [简体中文](./README.zh-CN.md)

</div>

---

<div align="center">
  <img src="assets/readme/hero-workbench.png" alt="Ciro Code workbench" width="920" />
</div>

## Install

Node.js **20+**. Windows (pwsh recommended), macOS, or Linux.

```bash
npm install -g @ciro-code/code

ciro web                 # → http://127.0.0.1:5280
ciro web --mock          # UI without an API key
ciro web -w . --mode ask # open this repo read-only
```

Set `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`, or add a provider in **Settings → Models**.

## Modes

`Ask` · `Plan` · `Agent` · `Debug` — switch via the top bar, `Shift+Tab`, or `/mode`.

See [Modes](https://raysolid.github.io/ciro-code/docs/en/guides/modes/) and [Quickstart](https://raysolid.github.io/ciro-code/docs/en/getting-started/quickstart/).

## Build from source

```bash
git clone https://github.com/Raysolid/ciro-code.git
cd ciro-code
pnpm install && pnpm run build
pnpm run dev:web:mock
```

Requires pnpm 9+. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Contributing

[Issues](https://github.com/Raysolid/ciro-code/issues) · [CONTRIBUTING.md](./CONTRIBUTING.md) · security via [Advisories](https://github.com/Raysolid/ciro-code/security/advisories/new) ([SECURITY.md](./SECURITY.md))

## License

[MIT](./LICENSE)
