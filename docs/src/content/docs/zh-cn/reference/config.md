---
title: 配置参考
description: 配置优先级、落盘位置与完整的 .ciro/config.yaml 生产级配置范式。
---

Ciro Code 采用分层配置架构。本页介绍配置生效优先级、存储路径以及完整的 `.ciro/config.yaml` 配置规范。

---

## 配置生效优先级（后覆盖前）

当多个层级存在同名字段时，**越靠后优先级越高**：

```text
[1. 内置默认值]
       ↓
[2. 用户全局配置] (~/.ciro/config.yaml & credentials/)
       ↓
[3. 工作区项目配置] ({workspace}/.ciro/config.yaml)
       ↓
[4. 环境变量] (DEEPSEEK_API_KEY, CIRO_PORT 等)
       ↓
[5. CLI 命令行参数] (--mode, -w, -p 等)
```

1. **内置默认值**：开箱即用的默认安全策略与端口。
2. **用户全局配置**：存储于 `~/.ciro/`，跨所有本地项目共享（如用户已保存的 Provider 密钥、全局偏好）。
3. **工作区项目配置**：存储于 `{workspace}/.ciro/config.yaml`（建议提交入 Git 仓库），统一团队安全基线。
4. **环境变量**：在当前终端环境中显式注入的临时变量。
5. **CLI 参数**：启动命令直接指定的最高优先级标志。

---

## 配置文件完整范本（`.ciro/config.yaml`）

以下是一份可在项目根目录创建的推荐生产级配置模板：

```yaml
# {workspace}/.ciro/config.yaml
# Ciro Code 工作区基线配置

# 1. 默认工作模式 (ask | plan | agent | debug)
mode: agent

# 2. 安全策略与沙箱控制
permissions:
  # 预设等级: workspace-readonly | plan-readonly | workspace-write | debug-instrument
  preset: workspace-write

  # 文件系统路径访问边界 (工作区相对路径通配符)
  fs:
    allow:
      - "src/**"
      - "tests/**"
      - "package.json"
      - "tsconfig.json"
      - "README.md"
    deny:
      - ".env*"
      - "*.pem"
      - "deploy/production/**"
      - "secrets/**"

  # 受控 Shell 命令执行规则
  shell:
    # 自动放行的白名单指令 (前缀或通配符匹配)
    allowlist:
      - "git status"
      - "git diff*"
      - "git log*"
      - "npm test*"
      - "pnpm test*"
      - "npm run build"
      - "npx eslint *"
      - "cargo check*"
    # 严格拦截的高危黑名单 (一律阻止执行)
    deny:
      - "rm -rf *"
      - "curl *"
      - "wget *"
      - "Invoke-WebRequest *"
      - "drop database *"
    # 单次命令执行超时时间 (秒，默认 60)
    timeoutSeconds: 60

# 3. 原生工具暴露清单 (若留空则按 mode 自动暴露)
tools:
  - read
  - edit
  - write
  - list_files
  - grep
  - bash

# 4. 工作台服务偏好设置
server:
  port: 5280
  openBrowser: true
```

---

## 常用环境变量对照

| 环境变量 | 作用 | 对应 CLI / 配置项 |
|---------|------|-------------------|
| `DEEPSEEK_API_KEY` | DeepSeek 推理密钥 | 设置页 DeepSeek Key |
| `OPENAI_API_KEY` | OpenAI 推理密钥 | 设置页 OpenAI Key |
| `ANTHROPIC_API_KEY`| Anthropic 推理密钥 | 设置页 Claude Key |
| `CIRO_PORT` | 本地 Web 工作台监听端口 | `-p, --port` |
| `CIRO_TUI_MINIMAL` | 终端 TUI 使用行内流式输出 | `--minimal` |

---

## 配置自省与诊断命令

在终端中执行以下命令可清晰查看当前生效配置及来源：

```bash
# 打印当前工作区的生效配置与每个字段的来源 (默认/用户/项目/环境)
ciro config show -w .

# 输出合并后的完整 JSON 配置
ciro config effective -w .

# 校验当前工作区 .ciro/config.yaml 语法与合法性
ciro config validate -w .

# 交互式向导生成推荐的初始配置文件
ciro config wizard -w .
```

---

## 接下来

- [权限与安全沙箱详解](/guides/permissions/)
- [模型与 Provider 连接配置](/customize/providers-models/)
- [命令行 CLI 参考](/reference/cli/)
