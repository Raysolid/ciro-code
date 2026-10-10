---
title: Feature Packs
description: 安装并启用 Feature Pack。
---

Feature Pack 提供可选 UI 与工具（例如 Git）。Pack 安装到**用户级**目录 `~/.ciro/packs/`，与项目 `package.json` 解耦。

## 安装 ≠ 启用

1. 用 CLI **安装**。
2. 在 **设置 → Feature packs** **启用**。
3. 在工作台确认 Pack 面板。

## 安装（npm 产品）

```bash
ciro pack add @ciro-code/ext-git
```

列表与卸载：

```bash
ciro pack list
ciro pack remove @ciro-code/ext-git
```

:::note
安装不会自动启用。请到设置 → Feature packs 打开开关。
:::
