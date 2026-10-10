---
title: Packs
description: Install and enable Feature Packs.
---

Feature Packs add optional UI and tools (for example Git). Packs install into the **user** directory `~/.ciro/packs/` and are independent of your project `package.json`.

## Install ≠ enable

1. **Install** with the CLI.
2. **Enable** in Settings → Feature packs.
3. Confirm the pack panel in the workbench.

## Install (npm product)

```bash
ciro pack add @ciro-code/ext-git
```

List and remove:

```bash
ciro pack list
ciro pack remove @ciro-code/ext-git
```

:::note
Installing a pack does not enable it. Open Settings → Feature packs to turn it on.
:::
