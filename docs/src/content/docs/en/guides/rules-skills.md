---
title: Rules & skills
description: Project rules and on-demand skills.
---

## Rules

Project and user rules guide the agent (conventions, stack preferences). Typical locations:

- `{workspace}/.ciro/rules/**`
- `~/.ciro/rules/**`

A root `AGENTS.md` in the workspace may also be loaded as project guidance. Keep rules short and actionable.

## Skills

Skills are optional playbooks injected when relevant (token-budgeted). They live under workspace or user `.ciro` skill directories and can declare MCP requirements so they only apply when those servers are enabled for the session.

Configure and inspect skills from the workbench Settings and related panels. For automation install notes, see the repo [AGENTS.md](https://github.com/Raysolid/ciro-code/blob/main/AGENTS.md).
