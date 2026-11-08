---
title: Implement and Verify
description: Edit under Agent mode, run tests automatically, and review Diffs in Changes.
---

**Agent mode** is for real edits: under `workspace-write`, the Kernel can change files inside the path sandbox, run allowlisted commands, and self-correct from test feedback.

---

## Implementation flow

```mermaid
flowchart LR
  A[Goal + verify command] --> B[Sandboxed edits]
  B --> C[Auto tests]
  C --> D[Review Changes]
  D --> E[Local Git commit]
```

### 1. Switch to Agent
Click **Agent**, or `Shift + Tab`, or `/mode agent`.

### 2. Issue a verifiable prompt

Strong prompts include **goal + scope + verification**. Copy and adapt:

```text
Add international currency-symbol support to formatCurrency in @src/utils/format.ts.

Requirements:
1. Add unit tests in @tests/utils/format.test.ts;
2. Run npm test -- format and ensure all assertions pass;
3. Fix failures yourself; stop only when everything passes.
```

### 3. Human approval
During the run:
- **Allowlisted commands** (e.g. `git status`, `npm test`) stream automatically;
- **Sensitive or unknown commands** (install deps, touch build scripts, out-of-bound paths) pause for Allow once / Always allow / Deny.

### 4. Review Diffs in Changes
- **Side-by-side**: inspect additions and deletions;
- **Scope**: confirm no drive-by formatting or extra deps;
- **Revert**: roll back individual files from the panel if needed.

### 5. Local commit
After verification:

```bash
git add src/ tests/
git commit -m "feat(utils): add international currency formatting"
```

---

## Common mistakes

- ❌ **One huge unbounded task**: avoid “rewrite the whole repo”; slice into verifiable steps;
- ❌ **No verification command**: without `npm test` (or similar), subtle runtime errors slip through;
- ❌ **Push without reviewing Diff**: check Changes first.

---

## Next steps

- Stubborn failures: [Debug a Failure](/workflows/debug-a-failure/)
- Shell allowlist: [Permissions](/guides/permissions/)
- Changes UX: [Web workbench](/surfaces/web-workbench/)
