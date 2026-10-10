---
title: Modes
description: Pick Ask, Plan, Agent, or Debug for the job at hand.
---

Mode answers: **how should the agent behave right now?**  
Model answers: **which model runs** — configure that in Settings.

## Pick by intent

| Situation | Mode | What happens |
|-----------|------|----------------|
| Explain code, explore a repo, no edits | **Ask** | Read-oriented tools; safe default |
| Design an approach before touching files | **Plan** | Planning workflow; limited write risk |
| Implement a feature or fix | **Agent** | Can edit files and run shell under policy |
| Hunt a bug or failing test | **Debug** | Agent-like tools, tuned for diagnosis |

You can switch modes in the workbench at any time, or start with:

```bash
ciro web --mode ask
ciro web --mode agent
```

## Tips

- Start in **Ask** when you are unfamiliar with the repo.
- Use **Plan** when the change is large or risky.
- Always open **Changes** before you commit.
- Approvals may still appear for sensitive commands — that is expected.

Full CLI flags: [CLI reference](/reference/cli/).
