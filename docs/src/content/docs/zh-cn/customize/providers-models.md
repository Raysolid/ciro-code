---
title: 模型与 Provider 连接指南
description: DeepSeek、OpenAI、Claude、本地 Ollama 与自建兼容端点的连接配置与故障排查。
---

Ciro Code 采用 **BYOK（自带密钥）**：推理请求由本机直连你配置的模型端点，不经 Ciro 云端中转。

**工作模式**决定工具权限，**模型**决定推理能力，两者可独立切换。

---

## 连接方式总览

| 方式 | 适用场景 | 配置入口 |
|------|---------|----------|
| **Mock 模式** | 无 Key 时熟悉界面 | `ciro web --mock` |
| **工作台设置** | 多模型、自定义 Base URL、测通 | **设置 → 模型** |
| **环境变量** | 本机固定开发、脚本或 CI | `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` 等 |

工作台保存的 API 密钥加密存放在 `~/.ciro/credentials/`；非敏感 Provider 配置在 `~/.ciro/providers.json`。

---

## 常用 Provider 配置示例

### 1. DeepSeek（代码能力与成本较均衡）

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 获取 API Key。
2. **方式 A：工作台**
   ```text
   ciro web → 设置 → 模型 → 添加 Provider → DeepSeek 预设
   → 粘贴 API Key → 拉取并启用模型（如 deepseek-chat / deepseek-coder）
   ```
3. **方式 B：环境变量**
   ```bash
   # bash / zsh
   export DEEPSEEK_API_KEY="sk-..."
   ciro web

   # Windows pwsh
   $env:DEEPSEEK_API_KEY = "sk-..."
   ciro web
   ```

### 2. OpenAI / Azure OpenAI

- 环境变量：`OPENAI_API_KEY="sk-..."`
- 工作台默认 Base URL：`https://api.openai.com/v1`
- 常用模型：`gpt-4o`、`o3-mini`

### 3. Anthropic Claude

- 环境变量：`ANTHROPIC_API_KEY="sk-ant-..."`
- 常用模型：`claude-3-7-sonnet-20250219`、`claude-3-5-haiku`

### 4. 本地推理（Ollama / vLLM / LM Studio）

支持 OpenAI 兼容协议的本地或自建网关：

1. 启动 Ollama（默认 OpenAI 兼容口：`http://localhost:11434/v1`）
2. **设置 → 模型 → 添加 Provider**：
   - **名称**：`Ollama Local`
   - **Base URL**：`http://localhost:11434/v1`
   - **API Key**：任意占位（如 `ollama`）
3. 添加或拉取本地模型（如 `qwen2.5-coder:32b`），勾选启用。

---

## 连通性排障对照

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| **401 Unauthorized** | Key 无效或过期 | 核对 Key；确认账户额度 |
| **404 / Cannot POST** | Base URL 路径不对 | 补上 `/v1`（如 `https://api.deepseek.com/v1`） |
| **连接超时 (ETIMEDOUT)** | 代理或防火墙 | 检查 `HTTP_PROXY` / `HTTPS_PROXY` |
| **环境变量未生效** | 终端会话不一致 | 在导出变量的同一终端启动 `ciro web` |
| **回复乱码或截断** | 上下文过长 | `/compact`，或换更大上下文窗口的模型 |

---

## 接下来

- [快速上手](/getting-started/quickstart/)
- [工作模式与沙箱](/guides/modes/)
- [规则与 Skills](/guides/rules-skills/)
- [安全与凭据](/trust/security/)
