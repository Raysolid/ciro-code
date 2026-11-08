---
title: Plan a Change
description: Use Plan mode to draft step-by-step plans and test checklists before editing code.
---

Multi-file refactors, public API changes, or complex logic upgrades go wrong when you edit first. **Plan mode** allows read-only search and plan cards only—no source edits—until you approve a path.

---

## When to use Plan

- Refactors spanning 3+ interacting files;
- Shared contracts (API schemas, schemas/tables, core state machines);
- Larger features that need alignment before coding.

:::tip[Skip for small tasks]
Single-file fixes or clear function work can go straight to [Implement and Verify](/workflows/implement-and-verify/) (Agent mode).
:::

---

## Planning steps

### 1. Switch to Plan
Click **Plan**, or in Composer:

```text
/mode plan
```

### 2. Issue a constrained planning prompt

```text
We need to refactor the Axios request layer into a native fetch-based apiClient singleton.

Constraints:
1. Keep existing API function signatures and return types compatible;
2. Centralize 401 logout and global error toasts;
3. Produce a phased implementation plan and unit-test acceptance criteria.

Important: plan only—do not modify any source files yet.
```

### 3. Review the plan
Check the structured plan:
- [ ] Steps granular enough to compile/test independently?
- [ ] Edge cases and related tests covered?
- [ ] Fits current project conventions?

Iterate in chat (e.g. “In step 2, keep Axios as deprecated aliases”) until the plan is solid.

### 4. Switch to Agent to execute
Switch to **Agent**, then:

```text
Plan approved. Implement steps 1 and 2 from the plan above, and run npm test to verify.
```

---

## Common mistakes

- ❌ **Switch to Agent before the plan is settled**: edits start too early and drift;
- ❌ **Plans without verification**: every solid plan names how success is proven (test command or assertions).

---

## Next steps

- Execute and review diffs: [Implement and Verify](/workflows/implement-and-verify/)
- Unexpected failures: [Debug a Failure](/workflows/debug-a-failure/)
