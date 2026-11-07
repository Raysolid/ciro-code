---
title: What is Ciro Code
description: What Ciro Code is, what it is not, and where to start.
---

Ciro Code is a **local-first** coding agent: it reads files, runs commands, and edits code in projects on your machine. Inference goes only to **LLM endpoints you configure**—there is no Ciro cloud proxy.

## You will like it if

- You want source, secrets, and sessions to stay local (`~/.ciro/` and `{workspace}/.ciro/`)
- You switch trust by task: Ask (read-only) → Plan (plan first) → Agent (guardrailed edits) → Debug (hypothesis-driven fixes)
- Your daily entry points are the local **Web workbench** (`ciro web`) or the terminal UI (`ciro`)

## What it is not

- Not a hosted service that uploads your repo to edit it in the cloud
- Not a single-vendor IDE lock-in; you bring your own providers (BYOK / compatible endpoints)

## Get productive in three steps

1. [Install](/getting-started/install/) `ciro`
2. Follow the [Quickstart](/getting-started/quickstart/) to open the workbench and finish a first task
3. [Connect a model](/getting-started/first-provider/) when you need inference (or start with `ciro web --mock`)

## Where to go next

| If you want to… | Read |
|-----------------|------|
| Understand the tool loop, workspace, and sessions | [How it works](/concepts/how-it-works/) |
| Pick Ask / Plan / Agent / Debug | [Modes](/guides/modes/) |
| Learn the Web / terminal surfaces | [Web workbench](/surfaces/web-workbench/) · [Terminal UI](/surfaces/terminal-tui/) |
| Follow a task recipe | [Explore a codebase](/workflows/explore-codebase/) |
| Teach the agent your repo conventions | [Choose a mechanism](/customize/chooser/) |
| See where data lives and what leaves the machine | [Data & privacy](/concepts/data-and-privacy/) |
