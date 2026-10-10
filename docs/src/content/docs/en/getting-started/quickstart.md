---
title: Quickstart
description: Open the workbench and finish your first task in a few minutes.
---

Goal: install (if needed), open the workbench, pick a project, and run one real task.

## 1. Open the workbench

If `ciro` is not installed yet, follow [Install](/getting-started/install/), then:

```bash
ciro web
```

No API key yet? Explore the UI safely:

```bash
ciro web --mock
```

Your browser should open [http://127.0.0.1:3080](http://127.0.0.1:3080). Use `--no-open` if you prefer to open it yourself.

## 2. Choose a workspace

Until a folder is selected, the composer stays locked.

- Click the center prompt or sidebar **+** and pick your project
- Or start with a path: `ciro web -w /path/to/your/project`

## 3. Connect a model (skip if using Mock)

Open **Settings → Models**, add a provider and key, enable a model.

Or set `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` before `ciro web`. Details: [Connect a model](/getting-started/first-provider/).

## 4. Run a first task

Stay in **Ask** for a read-only pass. Try:

> Summarize this repository and list its main packages.

Send the message. Ciro creates a session on the first send.

Want the agent to edit files? Switch to **Agent**, then ask for a small, concrete change. See [Modes](/guides/modes/).

## 5. Review Changes

If files were edited, open **Changes** in the workbench. Inspect the diff, then commit with your own git workflow.

## You are in

Next useful pages: [Modes](/guides/modes/) · [Feature packs](/guides/packs/) · [Troubleshooting](/guides/troubleshooting/)
