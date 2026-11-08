---
title: Explore a Codebase
description: Use Ask mode to read-only map an unfamiliar repo, layers, and core dependencies.
---

On a new repo or a cross-module call chain, avoid editing first. **Ask mode** keeps the Kernel in a read-only sandbox so analysis never writes files.

---

## Quick start

1. Launch read-only from the repo root:
   ```bash
   ciro web -w . --mode ask
   # or TUI: ciro --mode ask
   ```
2. Confirm the top bar shows **Ask** (toggle with `Shift + Tab`).

---

## Prompt templates

Clear goals and bounds produce better answers. Copy and adapt:

### Scenario 1: Stack and entrypoints

```text
Read the root build manifests (e.g. package.json / pom.xml) and main entry files. Summarize the tech stack, module layering, and local build/test commands.
```

### Scenario 2: Vertical call chain

```text
Trace the flow from login to JWT issuance. Start at @src/controllers/auth.ts, follow related services and mappers, and outline the call chain.
```

### Scenario 3: Change impact

```text
If I change the UserRole enum in @src/types/user.ts, which modules and tests in this repo are affected? List impacted files and main risks.
```

---

## What to check

- **Tool stream**: mostly `grep`, `list_files`, `read` (plus read-scoped `bash` / `WebFetch` when needed);
- **No writes**: **Changes** on the right should stay empty;
- **Steer**: if the model wanders into `.git` or build output, press `Esc` and narrow the path scope.

---

## Common mistakes

- ❌ **Ask for edits in Ask mode**: writes are denied; you burn a turn;
- ❌ **Paste whole files**: prefer `@path` so the Kernel reads with line budgeting.

---

## Next steps

- Plan the change: [Plan a Change](/workflows/plan-a-change/)
- Small implementation: [Implement and Verify](/workflows/implement-and-verify/)
