---
title: Feature Packs
description: Install, manage, and activate modular Feature Packs.
---

Ciro Code follows the Unix tool philosophy: keep the Core Kernel execution engine lean, while distributing optional UI panels and specialized integrations as **Feature Packs**.

---

## Core Principles: Isolation & Safety

- **User-Level Global Directory**: All Packs install into `~/.ciro/packs/`. They never touch or pollute your project's `package.json` or `node_modules`.
- **Install ≠ Active**: Downloading a pack from npm only places the static assets on disk. To guard against malicious extensions executing unexpectedly, all packs require **explicit manual activation** in Settings.

---

## CLI Command Reference

### 1. Install an official or community pack

```bash
# Install the official Git diff & commit workbench panel
ciro pack add @ciro-code/ext-git
```

For local extension development, point directly to a local directory with `--from`:

```bash
ciro pack add --from ./packages/my-custom-pack
```

### 2. List installed packs

```bash
ciro pack list
```

The CLI prints package names, versions, and current activation status:

```text
Installed Feature Packs (~/.ciro/packs/):
  @ciro-code/ext-git@0.1.0 (enabled: false)
```

### 3. Remove a pack

```bash
ciro pack remove @ciro-code/ext-git
```

---

## Activating in the Workbench

1. Launch the workbench (`ciro web`).
2. Navigate to **Settings → Feature packs** in the lower-left corner.
3. Find the installed pack (e.g., `@ciro-code/ext-git`) and flip the toggle to ON.
4. Refresh the workbench. The new UI extension becomes active (for example, displaying a dedicated Git visualizer in the sidebar for interactive diff inspection and commits).

:::tip[Security Note]
Only install official or audited community packs. All runtime operations performed by packs remain bounded by Kernel workspace sandbox policies.
:::
