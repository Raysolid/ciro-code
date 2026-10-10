---
title: First provider
description: Configure an API key or try the workbench with --mock.
---

Ciro Code needs a model provider for real answers. You can explore the UI first with Mock.

## Option A — Mock (no key)

```bash
ciro web --mock
```

Mock does not call a remote model. Use it to verify install, workspace selection, and layout.

## Option B — Environment variables

Set one of:

```bash
# bash / zsh
export DEEPSEEK_API_KEY=your_key
# or
export OPENAI_API_KEY=your_key
```

```powershell
# pwsh
$env:DEEPSEEK_API_KEY = "your_key"
# or
$env:OPENAI_API_KEY = "your_key"
```

Then:

```bash
ciro web
```

## Option C — Settings UI

1. Start `ciro web` (Mock is fine for opening Settings).
2. Open **Settings → Models** (provider list).
3. Add a provider, paste the API key, pull models, and enable the ones you want.
4. Keys are stored locally under `~/.ciro/` (see [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)).

Never commit real keys to git or paste them into public issues.
