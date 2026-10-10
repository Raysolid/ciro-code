---
title: Install
description: Install Ciro Code with npm on Windows, macOS, and Linux.
---

Get `ciro` on your machine, then continue with [Quickstart](/getting-started/quickstart/).

## Requirements

- **Node.js 20+**
- npm (comes with Node)

## Install

```bash
npm install -g @ciro-code/code
ciro web
```

The CLI binary is `ciro` (same for `@ciro-code/cli`). Workbench: [http://127.0.0.1:3080](http://127.0.0.1:3080) · health: `/health`.

:::caution
Install the scoped package `@ciro-code/code`. Do **not** use `npm i -g ciro`.
:::

## Windows (recommended: pwsh)

Prefer **PowerShell 7 (`pwsh`)** over Windows PowerShell 5.1.

```powershell
npm install -g @ciro-code/code
ciro --help
ciro web --mock --no-open
```

In another terminal:

```powershell
curl http://127.0.0.1:3080/health
```

### ExecutionPolicy

If a script or installer fails with an execution policy error, understand your current policy first:

```powershell
Get-ExecutionPolicy -List
```

Only change policy if your organization allows it. Prefer installing via `npm` (above), which does not require loosening script policy for normal use.

### PATH

If `ciro` is not found after a global install:

1. Confirm the global npm prefix: `npm prefix -g`
2. Ensure that prefix’s `bin` / directory is on your `PATH`
3. Open a **new** terminal after installing
4. Re-run `npm install -g @ciro-code/code` if the shim was missing

### Port 3080

`ciro web` defaults to port **3080**. If the port is busy:

```powershell
netstat -ano | findstr 3080
```

Stop the conflicting process, or start with another port: `ciro web -p 3081`.

## Smoke test (no API key)

```bash
ciro web --mock --no-open
```

Then open `http://127.0.0.1:3080/health` and confirm a successful response.
