---
title: Providers & Models Guide
description: Connecting DeepSeek, OpenAI, Claude, local Ollama, and OpenAI-compatible gateways.
---

Ciro Code is **BYOK (Bring Your Own Key)**: inference goes from your machine straight to the endpoint you configure—no Ciro cloud proxy.

**Mode** controls tool permissions; **model** controls reasoning. Switch them independently.

---

## Connection options

| Method | Best for | Where |
|--------|----------|-------|
| **Mock mode** | Explore the UI without a key | `ciro web --mock` |
| **Workbench settings** | Multi-provider, custom Base URL, connectivity checks | **Settings → Models** |
| **Environment variables** | Fixed local setup, scripts, CI | `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, etc. |

Keys saved in the workbench are encrypted under `~/.ciro/credentials/`. Non-sensitive provider defs live in `~/.ciro/providers.json`.

---

## Provider setup examples

### 1. DeepSeek (strong coding, good cost balance)

1. Create an API key at [DeepSeek Open Platform](https://platform.deepseek.com/).
2. **Option A — Workbench**
   ```text
   ciro web → Settings → Models → Add Provider → DeepSeek preset
   → paste API key → fetch & enable models (e.g. deepseek-chat / deepseek-coder)
   ```
3. **Option B — Environment variables**
   ```bash
   # bash / zsh
   export DEEPSEEK_API_KEY="sk-..."
   ciro web

   # Windows pwsh
   $env:DEEPSEEK_API_KEY = "sk-..."
   ciro web
   ```

### 2. OpenAI / Azure OpenAI

- Env: `OPENAI_API_KEY="sk-..."`
- Default Base URL: `https://api.openai.com/v1`
- Common models: `gpt-4o`, `o3-mini`

### 3. Anthropic Claude

- Env: `ANTHROPIC_API_KEY="sk-ant-..."`
- Common models: `claude-3-7-sonnet-20250219`, `claude-3-5-haiku`

### 4. Local inference (Ollama / vLLM / LM Studio)

Any OpenAI-compatible local or self-hosted gateway:

1. Start Ollama (default OpenAI-compatible URL: `http://localhost:11434/v1`)
2. **Settings → Models → Add Provider**:
   - **Name**: `Ollama Local`
   - **Base URL**: `http://localhost:11434/v1`
   - **API Key**: any placeholder (e.g. `ollama`)
3. Add or fetch local models (e.g. `qwen2.5-coder:32b`) and enable them.

---

## Connectivity troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **401 Unauthorized** | Bad or expired key | Re-copy the key; check account quota |
| **404 / Cannot POST** | Wrong Base URL path | Ensure `/v1` (e.g. `https://api.deepseek.com/v1`) |
| **Timeout (ETIMEDOUT)** | Proxy / firewall | Check `HTTP_PROXY` / `HTTPS_PROXY` |
| **Env var ignored** | Different shell session | Start `ciro web` in the same terminal where you exported the var |
| **Garbled or cut-off replies** | Context overflow | `/compact`, or switch to a larger-context model |

---

## Next steps

- [Quickstart](/getting-started/quickstart/)
- [Modes & sandbox](/guides/modes/)
- [Rules & Skills](/guides/rules-skills/)
- [Security & credentials](/trust/security/)
