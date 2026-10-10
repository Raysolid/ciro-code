---
title: Modes
description: Ask, Plan, Agent, and Debug — workflow and permissions.
---

Mode controls **workflow and tool permissions**. Model choice (provider + model id) is separate under Settings.

| Mode | Intent | Typical tools |
|------|--------|----------------|
| **Ask** | Explain and explore without edits | Read-oriented tools; Task explore only |
| **Plan** | Design a change plan | Explore / verify / shell (no browser) |
| **Agent** | Implement changes | Write / edit / shell; browser when Playwright MCP is ready |
| **Debug** | Investigate failures | Similar to Agent, tuned for diagnosis |

Switch modes from the workbench UI, or start with a CLI override:

```bash
ciro web --mode ask
ciro web --mode agent
```

Always review **Changes** before committing. Prefer Ask/Plan when you are unsure; use Agent when you want the agent to edit files.
