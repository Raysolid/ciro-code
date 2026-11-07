---
title: How it works
description: Local process, workspace, sessions, and the tool loop behind Ciro Code.
---

Ciro Code is an **agentic harness** around a model: the model reasons; local tools read, search, edit, and run commands. You state a goal; it loops through gathering context, acting, and checking results. You can interrupt or steer at any time.

## The tool loop

A task usually cycles through three phases:

1. **Gather context** — search and read files, inspect errors and test output  
2. **Act** — edit or run commands within the active [mode](/guides/modes/) and [permissions](/guides/permissions/)  
3. **Verify** — re-run checks, review diffs, correct course  

Harder tasks loop many times; a read-only question may stop after step 1.

## What it can access

When you start in a project directory, Ciro can reach:

| Resource | Meaning |
|----------|---------|
| Workspace files | The current tree (out-of-tree writes are gated by policy and approvals) |
| Your terminal | The same command environment you have locally (shell allowlists / approvals apply) |
| Git state | Branch and dirty tree when Git is available |
| Project instructions | e.g. root `AGENTS.md` and `.ciro/rules` (see [Customize](/customize/chooser/)) |
| Session history | Stored on disk so you can resume (see [Workspace & sessions](/guides/workspace-session/)) |

Inference goes only to providers you configure; tools do not ship source to third parties by default. Details: [Data & privacy](/concepts/data-and-privacy/).

## Two surfaces, one kernel

| Surface | Command | Best for |
|---------|---------|----------|
| Web workbench | `ciro web` | Daily work with diffs, mode switching, providers, and packs |
| Terminal UI | `ciro` / `ciro tui` | Full-screen sessions that stay in the terminal |

Modes, permissions, and workspace policy are shared; UI differences are listed in [Web workbench](/surfaces/web-workbench/) and [Terminal UI](/surfaces/terminal-tui/).

## Mode vs model

- **Mode** controls which tools are allowed and whether files may be written  
- **Model** controls who reasons—switch it independently in Settings  

Do not swap models when you meant to swap modes: explore read-only in Ask; implement in Agent.

## What's next

- First win: [Quickstart](/getting-started/quickstart/)  
- Trust boundaries: [Modes](/guides/modes/)  
- Sandbox and approvals: [Permissions](/guides/permissions/)  
