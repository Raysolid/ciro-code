# AGENTS.md

Guidance for coding agents and automation installing or invoking Ciro Code.

## Install

```bash
npm install -g @ciro-code/code
```

Equivalent package (same `bin`): `npm install -g @ciro-code/cli`.

- Command: `ciro`
- Workbench: `http://127.0.0.1:3080`
- Health: `GET /health`

## Smoke test

```bash
ciro web --mock --no-open
```

Confirm `http://127.0.0.1:3080/health` responds. Prefer **pwsh** on Windows.

## Avoid

- `npm install -g ciro` (wrong package)
- Unofficial mirrors such as `@ciro/code`
- Flags not listed in `ciro --help` or the current npm release

For building from this repository, see the README **Development** section (Node.js 20+, pnpm 9+).
