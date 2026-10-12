---
title: What is Ciro Code
description: Design philosophy, architecture, and core capabilities of Ciro Code.
---

Ciro Code is a **local-first** AI coding agent harness that operates directly on your local workspace and filesystem.

Unlike cloud-hosted AI coding services that require uploading your repository to remote servers, Ciro Code runs a lightweight execution engine and Web workbench on your own machine. You retain full control over every tool execution, file change, and network connection.

- **Zero Data Egress**: Source code, Git diffs, API credentials, and session state remain strictly on your local disk (`{workspace}/.ciro/` and `~/.ciro/`). Only inference requests are sent directly to your configured LLM providers.
- **Guardrailed Execution Modes**: `Ask`, `Plan`, `Agent`, and `Debug` enforce clear read-only vs. read-write permissions, eliminating accidental edits.
- **Open Core Transparency**: The execution kernel and CLI are MIT-licensed and fully open source for auditable local security; the Web workbench ships freely with npm packages. See [What is Open Source](/open-core/what-is-open/).

We recommend reviewing the [Install guide](/getting-started/install/) first, then following the [Quickstart guide](/getting-started/quickstart/) for your first session.

## Four execution modes

The active mode dictates the agent's permission boundaries and tool capabilities (model providers are configured independently in Settings):

| Goal & Scenario | Mode | Permission & Behavior |
|-----------------|------|-----------------------|
| Understand repo structure, search code, read docs | **Ask** | **Strictly read-only**; only file search and inspection tools are active |
| Architectural proposals, step-by-step design | **Plan** | **Planning-oriented**; breaks down complex phases before any edit |
| Implement features, write code, run tests | **Agent** | **Full autonomous execution** within workspace sandbox and approval rules |
| Reproduce issues, isolate test failures | **Debug** | **Hypothesis-driven diagnosis** with targeted blast-radius containment |

Learn more in the [Modes guide](/guides/modes/).

## Modular Feature Packs

Ciro Code adheres to the Unix philosophy: keep the Kernel lean, and extend through standard packages:

- Run `ciro pack add @ciro-code/ext-git` to add a visual Git diff panel to the workbench.
- Feature Packs install into the user-level directory `~/.ciro/packs/`, never cluttering your project's `package.json`.
- Newly installed packs require explicit activation in Settings → Feature Packs. See [Feature Packs](/guides/packs/).

## Security & privacy guarantees

Ciro Code is architected with privacy as a non-negotiable principle:
- All local configuration is stored under `~/.ciro/config.yaml` and `{workspace}/.ciro/`.
- API keys stay local and are never relayed through intermediate servers.
- See [What is Open Source](/open-core/what-is-open/) for full license boundaries, and the repository [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md) for vulnerability disclosure policies.
