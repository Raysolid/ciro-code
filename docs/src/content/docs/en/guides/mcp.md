---
title: MCP tools
description: Connect local MCP servers and enable them per session.
---

MCP (Model Context Protocol) attaches **external tool processes** to the agent. Use it for out-of-repo systems (issues, browsers, databases).  
Prefer built-in shell + [permissions](/guides/permissions/) for local `git` / tests; use [Rules / Skills](/guides/rules-skills/) for prompts. See [Choose a mechanism](/customize/chooser/).

## Before you begin

- Workbench or TUI starts  
- Only add MCP commands you trust and can run locally

## Configure

Store servers in `~/.ciro/mcp.json` or **Settings → MCP tools**.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"]
    }
  }
}
```

Inject tokens via env—do not commit them. Illustrative example:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    }
  }
}
```

## Per-session enable

1. **Register** servers in Settings / `mcp.json`  
2. When starting a session, **check** the MCP servers you need in the composer toolbar or **+** menu  
3. Tools follow the active [mode](/guides/modes/); unchecked servers stay out of context

If a Skill lists `requiresMcp`, it is skipped until those MCP ids are enabled for the session.

## Safety

- MCP-driven reads/writes/commands still pass workspace policy and approvals  
- There is no “install any public MCP from a marketplace” path—only processes you configure locally  
- Keep secrets local; see [Security](/trust/security/)

## Success looks like

- Servers appear in Settings  
- With a server checked, the model can call its tools  
- Unchecked servers stay unavailable and keep context lean

## If it fails

- Process will not start → run the same `command` / `args` in your shell  
- Permission denied → [Permissions](/guides/permissions/)  
- Skill never loads → enable the MCP ids in `requiresMcp` for the session

## What's next

[Rules & Skills](/guides/rules-skills/) · [Feature packs](/guides/packs/) · [Security](/trust/security/)
