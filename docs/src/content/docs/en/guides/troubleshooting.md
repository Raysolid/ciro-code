---
title: Troubleshooting
description: Windows-first fixes for install, PATH, and ports.
---

## `ciro` not found (Windows)

1. Prefer **pwsh** (PowerShell 7).
2. Reinstall: `npm install -g @ciro-code/code`
3. Check `npm prefix -g` is on `PATH`
4. Open a new terminal

## Wrong package

If you installed `ciro` without the scope, uninstall it and use:

```bash
npm install -g @ciro-code/code
```

## Port already in use

Default port is **5280**.

```powershell
netstat -ano | findstr 5280
```

Use another port: `ciro web -p 5281`, or stop the process holding 5280.

## Health check fails

```bash
ciro web --mock --no-open
```

Then:

```bash
curl http://127.0.0.1:5280/health
```

You should see JSON with `"status":"ok"`. If the process exits immediately, read the terminal error (missing Node version, permission, etc.).

## No API key / model unavailable

Real models need a key or Settings provider. Use `--mock` to skip, or set `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` — see [Connect a model](/getting-started/first-provider/).

## Permission denied on writes or shell

Confirm Ask/Plan (read-only) vs Agent; check workspace `permissions` and approval prompts — see [Permissions](/guides/permissions/).

## ExecutionPolicy errors

```powershell
Get-ExecutionPolicy -List
```

Use npm global install for the CLI. Only change ExecutionPolicy if your environment allows it; do not disable security defaults casually.

## Still stuck

Run:

```bash
ciro doctor -w .
ciro debug -w .
```

Share the sanitized output (redact keys) when filing an issue.
