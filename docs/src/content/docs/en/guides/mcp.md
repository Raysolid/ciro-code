---
title: MCP
description: Model Context Protocol servers in Ciro Code.
---

MCP servers extend the agent with external tools (search, browser automation, custom APIs).

## Enable for a session

1. Configure MCP servers in Settings.
2. Enable the servers you need for the **current session** (for example from the composer **+** menu where applicable).
3. Tools from enabled servers become available according to mode policy.

## Boundaries

- Only servers you configure are contacted.
- Some capabilities (for example browser Task) require a ready Playwright MCP connection before they appear.
- Skills may declare `requiresMcp` so they stay inactive until the listed servers are enabled.

There is no cloud “MCP catalog” product surface in the current release — add servers you trust yourself.
