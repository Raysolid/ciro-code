---
title: What is Ciro Code
description: Positioning, boundaries, and where to start.
---

Ciro Code is a **local-first** coding agent: it reads files, runs commands, and edits code in projects on your machine. Inference goes only to LLM endpoints you configure—there is no Ciro cloud proxy.

## When it fits

- Source, secrets, and sessions should stay local: user dir `~/.ciro/`, project dir `{workspace}/.ciro/`
- You switch trust by task: Ask → Plan → Agent → Debug
- Daily entry points are the Web workbench `ciro web` or the terminal UI `ciro`

## Boundaries

- Not a hosted service that uploads your repo to edit it in the cloud
- Not a single-vendor IDE lock-in; bring your own keys or compatible endpoints

## vs hosted agents

| | Typical hosted agents | Ciro Code |
|--|----------------------|-----------|
| Code location | Often synced or uploaded | Stays on your machine |
| Models | Often tied to one vendor | BYOK or compatible endpoints |
| Risk control | Coarse or opaque | Modes, permissions, and approvals |

## Get started

1. [Install](/getting-started/install/) `ciro`
2. [Quickstart](/getting-started/quickstart/) — open the workbench and finish a first task
3. [Connect a model](/getting-started/first-provider/); or start with `ciro web --mock`

## Related pages

| Topic | Page |
|-------|------|
| Tool loop | [How it works](/concepts/how-it-works/) |
| Ask / Plan / Agent / Debug | [Modes](/guides/modes/) |
| Web / TUI | [Web workbench](/surfaces/web-workbench/) · [Terminal UI](/surfaces/terminal-tui/) |
| Conventions and extensions | [Choose a mechanism](/customize/chooser/) |
| Official packs such as Git | [Feature packs](/guides/packs/) |
| MIT open surface | [What is open source](/open-core/what-is-open/) |
