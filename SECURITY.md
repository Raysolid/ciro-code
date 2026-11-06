# Security Policy

## Reporting a vulnerability

Report security issues privately through [GitHub Security Advisories](https://github.com/Raysolid/ciro-code/security/advisories/new).

Do not open a public issue with exploit details or secrets.

## Credentials

Provider keys stay on the local machine:

| Location | Purpose |
|----------|---------|
| `~/.ciro/credentials/` | Stored API keys |
| `~/.ciro/providers.json` | Provider configuration |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | Optional environment defaults |

You can also manage providers in Settings. Never commit real keys or paste them into issues.

## Local data

Configuration and session state live under `.ciro` (workspace) and `~/.ciro` (user). Data is not uploaded unless you explicitly use a feature that contacts an external service.

## Network

Outbound traffic is limited to what you enable:

- Model provider APIs (when not using `--mock`)
- MCP servers, WebFetch, and other tools you configure

`ciro web --mock` does not call a real model provider.

## Supported versions

Fixes target the latest npm release of `@ciro-code/code` / `@ciro-code/cli`. Upgrade before reporting issues that may already be resolved.
