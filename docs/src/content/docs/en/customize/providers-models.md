---
title: Providers & models
description: Cookbooks for DeepSeek, OpenAI, and compatible endpoints—env vars and Settings.
---

Inference goes only to **endpoints you configure**. Mode controls permissions; the model reasons—pick them independently. For the shortest path see [Connect a model](/getting-started/first-provider/); this page is cookbooks and recovery.

Prefer the smallest customization first: [Choose a mechanism](/customize/chooser/).

## Before you begin

- You can start `ciro web` or `ciro`
- You have a provider API key (or use `--mock`)

## Options

| Option | Best for | Entry |
|--------|----------|-------|
| Mock | UI without a key | `ciro web --mock` |
| Environment variables | Machine defaults, CI / scripts | `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` |
| Settings UI | Multiple providers, model pick, Base URL | **Settings → Models** |
| Compatible endpoint | Self-hosted / proxy / other OpenAI-compatible APIs | Custom Base URL in Settings |

Keys live under `~/.ciro/credentials/`; provider list in `~/.ciro/providers.json` (no plaintext keys on disk). Never commit secrets or paste them into public issues. See [Security](/trust/security/).

## Cookbook: DeepSeek

1. Create an API key on the [DeepSeek platform](https://platform.deepseek.com/).  
2. Either:

```bash
# bash / zsh
export DEEPSEEK_API_KEY=sk-...
ciro web
```

```powershell
# pwsh
$env:DEEPSEEK_API_KEY = "sk-..."
ciro web
```

Or: open the workbench → **Settings → Models** → add the DeepSeek preset → paste the key → fetch/enable models (default Base URL is typically `https://api.deepseek.com/v1`).

3. Confirm the session model is a DeepSeek model.  
4. Send an Ask message to verify; on failure check the terminal and Settings connectivity test.

## Cookbook: OpenAI

```bash
export OPENAI_API_KEY=sk-...
ciro web
```

Or pick the OpenAI preset in Settings (`https://api.openai.com/v1`), paste the key, and enable models.

## Cookbook: OpenAI-compatible endpoint

For local gateways or third-party compatible APIs:

1. **Settings → Models → Add**, set a name and **Base URL** (public `https://…`; loopback addresses are usually rejected).  
2. Paste the API key the endpoint expects.  
3. Fetch the model list (if supported) or add model ids manually.  
4. Enable and send a short message to verify.

Anthropic and other presets, when shown in Settings, follow the same flow—trust the UI of your installed version.

## Success looks like

- Settings shows the provider configured (key masked)
- Non-mock sessions return real model replies
- `ciro web --mock` still works without a key

## If it fails

| Symptom | What to try |
|---------|-------------|
| No key / model unavailable | Export env vars in the **same** shell, or use Settings |
| Base URL rejected | Use public HTTPS; avoid disallowed `127.0.0.1` |
| Timeout / 401 | Check key, quota, corporate proxy |
| UI-only check | `--mock` — see [Troubleshooting](/guides/troubleshooting/) |

## What's next

- [Quickstart](/getting-started/quickstart/) · [Modes](/guides/modes/) · [Config precedence](/reference/config/) · [Data & privacy](/concepts/data-and-privacy/)
