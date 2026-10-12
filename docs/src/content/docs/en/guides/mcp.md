---
title: MCP Tools Integration
description: Connect and use Model Context Protocol (MCP) servers in Ciro Code.
---

The **Model Context Protocol (MCP)** is an open standard for connecting AI models to external tools and resources. By integrating MCP servers, you can equip Ciro Code with database querying, browser automation, and custom internal APIs.

---

## Configuring MCP Servers

MCP configurations are stored in `~/.ciro/mcp.json` or managed directly through the workbench under **Settings → MCP Tools**.

### Configuration example (`~/.ciro/mcp.json`)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
      "env": {
        "PUPPETEER_HEADLESS": "true"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      "env": {}
    },
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

---

## Per-Session Activation

To prevent context window saturation and tool confusion from loading dozens of tools simultaneously, Ciro Code utilizes **session-level on-demand activation**:

1. **Global registration**: Register all available MCP servers in Settings or `mcp.json`.
2. **Session toggle**: When starting a session, check the relevant MCP servers in the composer toolbar (or via the **+** menu).
3. **Dynamic exposure**: Exposed tools and resources adapt to the active execution mode (Ask / Plan / Agent) under your policy constraints.

---

## Security & Sandbox Boundaries

Tools executed via MCP remain strictly monitored by the Ciro Code security engine:

- **Policy enforcement**: File reads, writes, and shell operations invoked by an MCP tool are intercepted by the active workspace policy sandbox.
- **Local credential isolation**: Third-party tokens (like GitHub PATs or DB connection strings) remain exclusively inside your local environment.
- **No untrusted cloud registries**: Ciro Code does not connect to untrusted remote registries; it runs only explicitly configured local child processes.
