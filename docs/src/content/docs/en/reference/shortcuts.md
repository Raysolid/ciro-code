---
title: Shortcuts & Slash Commands
description: Keyboard shortcuts, input conventions, and complete slash command reference for Web Workbench and Terminal TUI.
---

Ciro Code delivers a keyboard-first development experience consistent across both the Web Workbench and the Terminal TUI. This page indexes all input conventions, navigation keybindings, and slash commands.

---

## Input conventions

| Input | Context | Behavior |
|-------|---------|----------|
| `@` | Composer | Fuzzy-search and mention workspace files |
| `/` | Composer | Open the slash command menu |
| `Shift + Tab` | Global | Cycle Ask → Plan → Agent → Debug |
| `Esc` | Global / active turn | Stop generation, dismiss modals, or cancel approvals |

---

## Slash commands

Type `/` in Composer or TUI to complete:

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/help` | - | Show slash commands and keybinding help |
| `/new` | - | Start a new session and reset working context |
| `/mode` | `[ask\|plan\|agent\|debug]` | Switch mode, e.g. `/mode agent` |
| `/model` | - | Open the model switcher |
| `/session` | `[id]` | Session picker; aliases `/sessions`, `/resume` |
| `/compact` | - | Manually compact context and trim history |
| `/clear` | - | Clear on-screen history; disk sessions kept |
| `/settings` | - | Quick settings: scroll, Vim, theme |
| `/theme` | `[dark\|light]` | Switch light / dark theme |
| `/mcp` | - | Manage session MCP; configure before first message |
| `/minimal` | - | TUI: leave alternate screen; inline streaming |
| `/fullscreen` | - | TUI: enter alternate screen |
| `/quit` | - | Quit; TUI alias `/exit` |

---

## Terminal TUI Keybindings

Keybindings available when running `ciro` or `ciro tui`:

### 1. Global Navigation & Control
| Keybinding | Action |
|------------|--------|
| `Ctrl + C` | Interrupt active task execution or model generation |
| `Ctrl + D` | Exit the terminal TUI |
| `Ctrl + S` | Toggle session picker overlay |
| `Ctrl + G` | Toggle Changes / Diff review panel |
| `Ctrl + T` | Toggle Subagent tasks view |
| `Ctrl + L` | Redraw terminal screen |
| `Ctrl + Q` | Clear queued messages |

### 2. Composer & Message Editing
| Keybinding | Action |
|------------|--------|
| `Enter` | Submit and send current message |
| `Shift + Enter` / `Alt + Enter` | Insert newline in composer |
| `Shift + Tab` | Cycle modes (Ask / Plan / Agent / Debug) |
| `Up` / `Down` | Navigate through prompt input history |
| `Ctrl + V` | Paste clipboard text or image |

### 3. Changes & Diff Review Overlay (`Ctrl + G`)
When inspecting diffs written by Agent mode:
| Keybinding | Action |
|------------|--------|
| `a` | Accept modification on the currently focused file |
| `r` | Reject and revert modification on the currently focused file |
| `A` | Accept all modifications across the workspace |
| `R` | Reject and revert all modifications across the workspace |
| `Tab` | Switch focus between file list and diff view |

---

## Web Workbench Interactions

When accessing `http://127.0.0.1:5280`:

- **Mode Tabs in Header**: Click to seamlessly switch between Ask, Plan, Agent, and Debug;
- **Changes Tab**: Review modifications in Side-by-Side or Inline diff view;
- **File Tree & Mentions**: Click files or type `@` in Composer to pull files into context;
- **Approval Modals**: Approvals appear centered with options: *Allow Once*, *Always Allow*, or *Deny*.

---

## Next Steps

- [Modes in Depth](/guides/modes/)
- [CLI Reference](/reference/cli/)
- [Configuration Reference](/reference/config/)
