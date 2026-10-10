---
title: What is Ciro Code
description: What Ciro Code is and when to use it.
---

Ciro Code is a local-first coding agent that works in your project directory.

You start a local Web workbench with the CLI. The agent runs tools under a policy sandbox you control.

Your config, API keys, and sessions stay on your machine. Ciro Code only calls model providers you enable; tools do not open the network on their own.

Ready to try it? Go to [Quickstart](/getting-started/quickstart/). Need the install command first? See [Install](/getting-started/install/).

## When to use each mode

| You want to… | Use |
|--------------|-----|
| Ask questions without editing files | **Ask** |
| Shape a plan before changing code | **Plan** |
| Let the agent implement changes | **Agent** |
| Dig into a failure or bug | **Debug** |

Mode sets the workflow and tool permissions. You pick the model separately in Settings. Details: [Modes](/guides/modes/).

## Extend the workbench

Optional Feature Packs add panels and tools (for example Git). Install with the CLI, then enable in Settings — install does not turn a pack on by itself. See [Feature packs](/guides/packs/).

## Privacy in one line

Everything product-related lives under `{workspace}/.ciro/` and `~/.ciro/`. See [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md) if you need paths and egress details.
