---
title: Docs content IA
description: Current information architecture for the Ciro Code documentation site.
---

# Docs content IA

Current sidebar and page map for `ciro-code/docs` (Starlight). Historical drafts live in Git; this file is the present snapshot.

## Principles

1. Job first, not feature inventory.
2. First win before deep theory.
3. Modes / permissions / local data are first-class.
4. Customize via the smallest mechanism (see `customize/chooser`).
5. Guides narrate; reference is lookup.
6. Humans use the sidebar; agents use `public/llms.txt`.
7. Open Core pages list **what is open** only—no contrast tables of closed surfaces.
8. No Pack authoring / empty SDK chapters; Packs docs = install + enable.

## Sidebar groups

| Group | Slugs |
|-------|-------|
| Get started | `getting-started/overview`, `install`, `quickstart`, `first-provider` |
| Concepts | `concepts/how-it-works`, `guides/modes`, `guides/permissions`, `concepts/data-and-privacy`, `guides/workspace-session` |
| Surfaces | `surfaces/web-workbench`, `surfaces/terminal-tui` |
| Workflows | `workflows/explore-codebase`, `plan-a-change`, `implement-and-verify`, `debug-a-failure` |
| Customize | `customize/chooser`, `guides/rules-skills`, `guides/mcp`, `guides/packs`, `customize/providers-models` |
| Reference | `reference/cli`, `config`, `shortcuts`, `changelog` |
| Trust & open source | `trust/security`, `open-core/what-is-open`, `project/contributing` (Open Kernel) |
| Troubleshooting | `guides/troubleshooting` |

## Shipped slices

- P0–P2: narrative IA through customize + security
- P3: Packs = user install/enable; Open Core = positive open inventory only
- Post-P3 polish: short how-it-works / overview; real Kernel tool names (`read`/`grep`/`bash`/…); Settings → Models; sessions under `~/.ciro/sessions/`; Packs restore official `--from`
