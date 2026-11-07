---
title: Debug a failure
description: Hypothesis-driven, minimal fixes in Debug mode.
---

## Before you begin

- You can reproduce the failure: command, stack, or red test output
- You roughly know the related paths (Ask first if needed)

## Steps

1. Switch to **Debug**:
   ```bash
   ciro web -w . --mode debug
   ```
2. Paste reproduction steps and the full error, for example:  
   “`npm test -- auth` fails with the stack below. List hypotheses, then make the smallest fix and re-run.”
3. Ask Ciro to: **list hypotheses → pick the likeliest → minimal edit → re-run the same command**.
4. Review Diffs in Changes; reject unrelated refactors.
5. When green, return to Ask/Agent for cleanup, or commit.

## Success looks like

- Hypotheses and checks are explicit
- Diffs stay on the causal path; the same reproduction improves or passes

## If it fails

- Still not reproducible → add environment, branch, and `@` files
- Blast radius grows → say “no refactors—fix this failure only”; revert and retry if needed
- Permissions block required commands → [Permissions](/guides/permissions/)

## What's next

[Implement and verify](/workflows/implement-and-verify/) · [Modes](/guides/modes/) · [Troubleshooting](/guides/troubleshooting/)
