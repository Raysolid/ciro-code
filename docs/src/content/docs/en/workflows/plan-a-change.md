---
title: Plan a change
description: Use Plan mode for a step list before any source edits.
---

## Before you begin

- Orient with [Explore a codebase](/workflows/explore-codebase/) or your own knowledge
- Use Plan for multi-file or higher-risk work; small, clear fixes can go straight to [Implement and verify](/workflows/implement-and-verify/)

## Steps

1. Switch to **Plan**:
   ```bash
   ciro web -w . --mode plan
   ```
   Or cycle modes in the workbench / TUI (for example `Shift+Tab`).
2. State the goal, constraints, and acceptance checks, for example:  
   “Unify error handling on the boot path: find every catch, wrap with AppError; give a step plan—do not edit source yet.”
3. Review the plan: are steps testable, is the blast radius acceptable, are tests missing?
4. Iterate on the plan in chat; when it looks right, switch to **Agent** and implement.

## Success looks like

- You get a step plan / plan card without source-file writes
- You can point to “do this first” and “how we verify”

## If it fails

- The model starts editing → confirm you are still in Plan; see [Modes](/guides/modes/)
- The plan is too vague → add constraints, `@` key files, ask for paths that will change

## What's next

[Implement and verify](/workflows/implement-and-verify/) · [Permissions](/guides/permissions/)
