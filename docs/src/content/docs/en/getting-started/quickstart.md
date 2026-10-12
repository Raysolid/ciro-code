---
title: Quickstart
description: Launch the local workbench and finish your first real coding task in minutes.
---

This guide gets you up and running in under five minutes: start the local workbench, select your project, connect a model, and execute your first end-to-end task.

## 1. Launch the workbench

In a terminal with Node.js 20+ installed (see [Install](/getting-started/install/) if needed), run:

```bash
ciro web
```

The terminal prints the server address and automatically opens your default browser:

```text
✓ Ciro Kernel initialized (mode: ask, policy: workspace-balanced)
✓ Local Web Workbench running at http://127.0.0.1:3080
Opening browser...
```

If you do not have an API key ready yet, run in mock mode to explore the interface safely:

```bash
ciro web --mock
```

Your browser opens [http://127.0.0.1:3080](http://127.0.0.1:3080). Append `--no-open` if you prefer not to auto-launch the browser.

## 2. Select a workspace

Until a directory is chosen, the message composer is locked to prevent accidental executions.

- **Option A (UI)**: Click the central workspace prompt or the **+** icon in the sidebar to pick your project folder from the native picker.
- **Option B (CLI flag)**: Specify the project directory directly on launch with `-w`:
  ```bash
  ciro web -w ~/code/my-app
  ```

## 3. Connect a model (skip if using mock)

To get real AI inferences for coding tasks:

1. Click **Settings → Providers** in the bottom-left corner of the workbench.
2. Add your provider (DeepSeek, OpenAI, Ollama, or any compatible endpoint), enter your API key, and enable your models.
3. Your API keys are stored strictly in `~/.ciro/` on your machine and are never uploaded to a cloud proxy.

You can also export keys in your shell prior to startup:
```bash
export DEEPSEEK_API_KEY="sk-..."  # Windows pwsh: $env:DEEPSEEK_API_KEY="sk-..."
```
See the [Connect a model guide](/getting-started/first-provider/) for details.

## 4. Run your first task

The top mode switcher defaults to **Ask** (read-only) mode.

### Scenario A: Explore and understand a codebase (Ask mode)

Type the following prompt into the composer to test comprehension:

> Inspect `package.json` and the main entry file. Summarize the project stack and primary module architecture.

Ciro creates a new session upon sending the message, searches the relevant files, and displays its reasoning in real-time on the right pane—strictly read-only.

### Scenario B: Targeted edit and verification (Agent mode)

When you are ready for Ciro to write code, click the mode bar to switch to **Agent** mode, then try a concrete task:

> Add unit tests for the `calculateTotal` function in `src/utils/math.ts`, and run `npm test` to verify.

In Agent mode, Ciro modifies files within workspace sandbox boundaries, executes the test command, and reports live test execution results in the UI.

## 5. Review Changes (Changes tab)

Whenever an agent modifies files, the **Changes** tab highlights the edits:

1. Click the **Changes** tab to review side-by-side or inline diffs.
2. Once the changes look clean and all tests pass, commit them with your normal Git workflow.

## What's next

- Understand the trust boundaries: [Execution Modes](/guides/modes/)
- Extend workbench capabilities via npm: [Feature Packs](/guides/packs/)
- Experiencing port or PATH issues? See [Troubleshooting](/guides/troubleshooting/)
