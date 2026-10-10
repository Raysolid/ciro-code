---
title: Overview
description: What Ciro Code is and how it fits with Ciro Chat.
---

Ciro Code is a **local coding agent** with a Web workbench. It works in your project directory, runs tools under a policy sandbox, and supports four modes: **Ask**, **Plan**, **Agent**, and **Debug**.

## Surfaces

| Surface | Role |
|---------|------|
| **CLI** | `ciro` — install packs, start the server, doctor / migrate / debug |
| **Web UI** | Local workbench at `http://127.0.0.1:3080` |
| **Packs** | Optional Feature Packs (for example Git) installed into `~/.ciro/packs/` |

## Local-first

Configuration, credentials, and sessions stay on your machine under `.ciro` (workspace) and `~/.ciro` (user). Outbound network use is limited to model providers and tools you enable. See [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md).

## Ciro Chat

Ciro Chat is a separate multi-model chat product. Chat does **not** host this documentation site or the Ciro Code workbench. Install and run Ciro Code on your machine with npm — see [Install](/getting-started/install/).
