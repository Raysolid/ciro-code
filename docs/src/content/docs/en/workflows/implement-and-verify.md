---
title: Implement and verify
description: Make guardrailed edits in Agent mode, then check tests and diffs.
---

## Before you begin

- Scope is clear, or you already have a [plan](/workflows/plan-a-change/)
- You know workspace [permissions](/guides/permissions/) (Agent defaults to a write preset with approvals for sensitive actions)
- You know how to run local checks (for example `npm test`)

## Steps

1. Switch to **Agent**:
   ```bash
   ciro web -w . --mode agent
   ```
2. Give a verifiable goal, for example:  
   “Implement the plan in `src/…`, run `npm test`, and stop only when it passes.”
3. Watch tool calls and approval prompts; confirm sensitive shell or out-of-tree paths yourself.
4. Open **Changes** (Web) to review diffs; ask for another test run or a smaller patch if needed.
5. Commit with local Git; do not push unreviewed diffs.

## Success looks like

- Diffs under Changes match the goal
- Agreed checks ran with the expected outcome (or failures are explained)

## If it fails

- Permission denied → tighten or adjust allowlists; see [Permissions](/guides/permissions/)
- Tests red → stay in Agent to fix, or move to [Debug a failure](/workflows/debug-a-failure/)
- Diff too large → ask to split steps or revert unrelated files

## What's next

[Debug a failure](/workflows/debug-a-failure/) · [Web workbench](/surfaces/web-workbench/) · [Choose a mechanism](/customize/chooser/)
