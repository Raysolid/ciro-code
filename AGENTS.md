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

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
