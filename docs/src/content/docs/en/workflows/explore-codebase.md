---
title: Explore a codebase
description: Orient in an unfamiliar repo with Ask mode (read-only).
---

## Before you begin

- [Install](/getting-started/install/) `ciro`
- Open the repo root (or pass `-w`)
- Have a model configured, or use `--mock` to practice the flow

## Steps

1. Start read-only:
   ```bash
   ciro web -w . --mode ask
   # or: ciro --mode ask
   ```
2. Confirm the mode is **Ask** (`Shift+Tab` cycles modes).
3. Ask concrete questions, for example:
   - “What are the entry points and main modules?”
   - “Where does authentication start?”
   - “Which scripts in `package.json` run tests locally?”
4. Use `@path` to pull specific files into context.
5. Follow up on boundaries and dependencies—**do not** ask for edits in Ask.

## Success looks like

- Tool use is mostly search / read
- No project-file edits; Changes stays empty

## If it fails

- Unexpected errors → [Troubleshooting](/guides/troubleshooting/)
- Files start changing → switch back to Ask, or check you did not enable a write mode

## What's next

Once oriented: [Plan a change](/workflows/plan-a-change/) · [Implement and verify](/workflows/implement-and-verify/)
