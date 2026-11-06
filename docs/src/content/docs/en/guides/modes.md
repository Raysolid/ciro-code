---
title: Execution Modes
description: Understand permission boundaries and lifecycle workflows across Ask, Plan, Agent, and Debug.
---

In Ciro Code:
- **Mode** determines: **What behavioral constraints and tool permissions does the agent have right now?**
- **Model** determines: **Which LLM weights supply reasoning?** (Configured and swapped independently in Settings).

---

## Comparison Matrix

| Mode | Target Scenario | Active Tools & Permissions | Human Gate |
|------|-----------------|----------------------------|------------|
| **Ask** | Explore architecture, understand code, check docs | **Strictly read-only** (`workspace-readonly`)<br>Read / search / readonly bash / WebFetch / explore Task | Touches zero project files |
| **Plan** | Complex refactors, architecture proposals, pre-flight reviews | **Planning-oriented** (`plan-readonly`)<br>Ask tools plus plan tools; no source-file writes | You review the plan, then switch to **Agent** to implement |
| **Agent** | Feature implementation, refactoring, test execution | **Policy-bounded execution** (`workspace-write`)<br>Edits files and runs allowlisted shell commands | Sensitive commands and out-of-bound edits trigger modal approval |
| **Debug** | Fix crashes, investigate test failures, fix defects | **Hypothesis-driven** (`debug-instrument`)<br>Write / edit plus session debug-log cleanup | Keep the blast radius small; verify with targeted traces |

---

## Recommended Workflow Pipeline

For complex feature development or refactoring, follow this multi-phase lifecycle:

```text
[1. Ask] Understand Context  ──>  [2. Plan] Draft Proposals  ──>  [3. Agent] Execute & Test  ──>  [4. Debug] Targeted Fixes
```

1. **Step 1: Ask (Explore first)**  
   Ask Ciro to explain current modules, dependencies, and blast radius in read-only mode to prevent premature edits.
2. **Step 2: Plan (Architect the steps)**  
   Direct Ciro to generate a phased plan (plan tools only — no source-file writes in Plan mode).
3. **Step 3: Agent (Execute under policy)**  
   Switch to Agent mode. Let Ciro implement edits and run allowlisted commands under `workspace-write`. Review live diffs in the Changes tab.
4. **Step 4: Debug (Contain the blast radius)**  
   If unexpected test failures arise, switch to Debug mode and provide the stack trace to isolate root causes with a minimal patch.

---

## Switching Modes

- **In the Workbench**: Click the mode pills in the top bar (Ask / Plan / Agent / Debug) for instant switching.
- **On CLI Launch**:
  ```bash
  ciro web --mode ask      # Start in read-only mode
  ciro web --mode agent    # Start in agent execution mode
  ```
- **Workspace Config**: Set `mode: ask` in `{workspace}/.ciro/config.yaml` to pin project defaults.
