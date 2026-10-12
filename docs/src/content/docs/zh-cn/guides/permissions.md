---
title: 权限与安全沙箱
description: 工作区沙箱、策略预设、审批流程与 Shell 白名单。
---

Ciro Code 将安全性置于首位。Agent 并不是无限制运行的高权限进程，而是在**工作区沙箱**与**分级审批策略**的约束下受控工作。

---

## 策略预设（Presets）

在 `{workspace}/.ciro/config.yaml` 或工作台设置中，你可以为工作区指定安全预设级别：

| 预设等级 | 模式匹配 | 适用场景与安全行为 |
|----------|----------|--------------------|
| `workspace-readonly` | Ask 模式默认 | 严格只读，禁止写文件或执行带状态变更的命令 |
| `workspace-balanced` *(推荐默认)* | Agent 模式默认 | 允许修改工作区内文件与执行白名单命令；敏感操作弹出确认 |
| `workspace-unrestricted` | 高度信任环境 | 放宽内部审批；仍受项目目录边界隔离保护 |

---

## 配置文件范例

你可以在项目根目录的 `.ciro/config.yaml` 中精确声明权限与命令白名单：

```yaml
# {workspace}/.ciro/config.yaml
mode: agent

permissions:
  preset: workspace-balanced
  fs:
    # 允许修改的路径范围（工作区相对路径）
    allow: ["src/**", "tests/**", "package.json"]
    # 绝对禁止修改的敏感文件
    deny: [".env*", "*.pem", "deploy/production/**"]
  shell:
    # 自动放行的常用命令（支持前缀与通配符）
    allowlist:
      - "git status"
      - "git diff*"
      - "pnpm test*"
      - "npm run build"
      - "npx eslint *"
    # 严格拦截的高危指令（即使在宽松模式下也禁止）
    deny:
      - "rm -rf *"
      - "curl *"
      - "wget *"
      - "drop database *"
```

---

## 人工交互式审批

当 Agent 尝试执行不在 `allowlist` 内的 Shell 命令或触及边界文件时，执行流水线会挂起并在工作台弹出**审批对话框**：

- **允许一次 (Allow Once)**：仅本次工具调用放行，便于临时排查。
- **记住并允许 (Always Allow)**：将该命令自动追加到当前工作区的允许列表。
- **拒绝 (Deny)**：中止当前操作，Agent 将收到明确的权限拒绝反馈，并尝试替代方案。

---

## 网络出网约束

- **模型推理**：仅直接发往你在设置中明确配置的模型 API 端点（如 DeepSeek、OpenAI），杜绝任何第三方中转。
- **Web 工具**：仅在安装了检索类扩展或配置了特定 MCP 时按需出网。
- **Shell 防火墙**：策略引擎会主动拦截 Shell 命令行中未经许可的 `curl`、`wget`、PowerShell Web Cmdlet（如 `Invoke-WebRequest`），避免指令注入导致源码泄露。

完整漏洞报告政策请参阅仓库 [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。
