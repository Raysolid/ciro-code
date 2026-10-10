---
title: Permissions
description: Sandbox, approvals, and shell allowlists.
---

Ciro Code runs tools inside a **workspace sandbox** with mode-based allowlists. Sensitive actions may require approval.

## Presets

Config can select permission presets such as read-only vs workspace write (see [Config](/reference/config/) and `ciro config wizard`).

## Shell allowlist

Agent shell commands can be constrained by an allowlist (Settings → Agent / permissions). You can allow once or remember commands according to the UI prompts.

## Network

- Model calls go to providers you configure.
- `WebFetch` and MCP tools only run when the agent uses them under policy.
- Policy blocks casual `curl` / `wget` / PowerShell web cmdlets from shell; use built-in fetch tools instead.

See [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md) for credential and egress notes.
