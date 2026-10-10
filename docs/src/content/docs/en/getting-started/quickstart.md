---
title: Quickstart
description: From install to your first session and Changes.
---

## 1. Install

```bash
npm install -g @ciro-code/code
```

## 2. Start the workbench

Without a model key (UI only):

```bash
ciro web --mock
```

With a real model (after [First provider](/getting-started/first-provider/)):

```bash
ciro web
```

The CLI prints the workbench URL (default [http://127.0.0.1:3080](http://127.0.0.1:3080)) and opens the browser unless you pass `--no-open`.

## 3. Choose a workspace

If no workspace is selected, use the center prompt or sidebar **+** to pick a local folder. Recent workspaces are remembered for the next launch (when you omit `-w`).

You can also pin a workspace from the CLI:

```bash
ciro web -w /path/to/your/project
```

## 4. Send a first message

Type a short task in the composer and send. A session is created when the first message is sent.

In **Ask** mode the agent stays read-oriented. Switch to **Agent** when you want edits (see [Modes](/guides/modes/)).

## 5. Review Changes

When the agent edits files, open the **Changes** view in the workbench to inspect diffs before you commit in git yourself.

## Next

- [Modes](/guides/modes/)
- [Troubleshooting](/guides/troubleshooting/)
