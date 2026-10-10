---
title: Connect a model
description: Add an API key in Settings, or explore the UI with Mock first.
---

Real answers need a model. You can open the workbench with Mock first, then connect a provider when you are ready.

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
