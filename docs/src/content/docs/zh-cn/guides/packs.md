---
title: Feature Packs 扩展
description: 安装、管理与启用模块化 Feature Pack 扩展包。
---

Ciro Code 遵循 Unix 工具设计哲学：保持 Kernel 核心执行引擎精炼稳定，将可选的可视化面板与特定生态工具作为 **Feature Packs** 独立分发。

---

## 核心设计：隔离与安全

- **全局用户级目录**：所有 Pack 统一安装在 `~/.ciro/packs/` 下，绝不会修改或污染你本地项目的 `package.json` 或 `node_modules`。
- **安装 ≠ 启用**：从 npm 下载安装 Pack 仅意味着静态代码就绪。为了防止恶意扩展自动执行，所有 Pack 必须在工作台设置中**显式手动开启**。

---

## CLI 命令参考

### 1. 安装官方或社区 Pack

```bash
# 从 npm 安装官方 Git 可视化面板
ciro pack add @ciro-code/ext-git
```

本地扩展开发时，可使用 `--from` 指向本地源码目录测试：

```bash
ciro pack add --from ./packages/my-custom-pack
```

### 2. 查看已安装列表

```bash
ciro pack list
```

控制台将输出已安装的包名、版本号以及当前启用状态：

```text
Installed Feature Packs (~/.ciro/packs/):
  @ciro-code/ext-git@0.1.0 (enabled: false)
```

### 3. 卸载 Pack

```bash
ciro pack remove @ciro-code/ext-git
```

---

## 在工作台中启用与使用

1. 打开工作台（`ciro web`）。
2. 点击左下角 **设置 → Feature packs**。
3. 找到已安装的扩展（例如 `@ciro-code/ext-git`），打开启用开关。
4. 刷新工作台后，界面将出现对应的扩展面板（例如在侧边栏出现专属 Git 视图，提供图形化 Stage、Diff 审查与一键 Commit 功能）。

:::tip[安全提示]
仅安装你信任的官方或经代码审计的社区 Pack。每个 Pack 运行时依然受 Kernel 沙箱策略的读写权限约束。
:::
