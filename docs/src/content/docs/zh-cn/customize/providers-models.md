---
title: 模型与 Provider
description: DeepSeek、OpenAI 与兼容端点的连接菜谱；环境变量与设置页。
---

推理只发往**你配置的端点**。模式管权限，模型管推理——二者独立。最短路径仍见 [连接模型](/getting-started/first-provider/)；本页是常用菜谱与排错。

先确认不需要先上 MCP / Pack：[如何选择扩展方式](/customize/chooser/)。

## 开始前

- 已能启动 `ciro web` 或 `ciro`
- 准备好 Provider 的 API Key（或先用 `--mock`）

## 方式对照

| 方式 | 适合 | 命令 / 入口 |
|------|------|-------------|
| Mock | 无 Key 逛界面 | `ciro web --mock` |
| 环境变量 | 本机默认、CI / 脚本 | `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` |
| 设置页 | 多 Provider、选模型、改 Base URL | **设置 → 模型** |
| 兼容端点 | 自建 / 代理 / 其他 OpenAI 兼容 API | 设置里自定义 Base URL |

密钥落在 `~/.ciro/credentials/`；Provider 列表在 `~/.ciro/providers.json`（磁盘上不落明文 Key）。切勿提交 Git 或贴进公开 Issue。见 [安全](/trust/security/)。

## 菜谱：DeepSeek

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key。  
2. 任选其一：

```bash
# bash / zsh
export DEEPSEEK_API_KEY=sk-...
ciro web
```

```powershell
# pwsh
$env:DEEPSEEK_API_KEY = "sk-..."
ciro web
```

或：打开工作台 → **设置 → 模型** → 添加 DeepSeek 预设 → 粘贴 Key → 拉取/启用模型（默认 Base URL 一般为 `https://api.deepseek.com/v1`）。

3. 在会话里确认当前模型已切换到 DeepSeek 系列。  
4. 发一条 Ask 消息验证；失败时看终端报错与设置页连通测试。

## 菜谱：OpenAI

```bash
export OPENAI_API_KEY=sk-...
ciro web
```

或在设置中选 OpenAI 预设（`https://api.openai.com/v1`），粘贴 Key 并启用模型。

## 菜谱：OpenAI 兼容端点

适用于本地网关、第三方兼容 API 等：

1. **设置 → 模型 → 添加**，填名称与 **Base URL**（须为公网可达的 `https://…`；本机回环地址通常会被拒绝）。  
2. 粘贴该端点要求的 API Key。  
3. 拉取模型列表（若端点支持）或手动添加模型 id。  
4. 启用后发一条短消息验证。

Anthropic 等预设若出现在设置中，按同样流程填写 Key；以当前版本设置页为准。

## 成功时你应看到

- 设置里 Provider 显示已配置（Key 被掩码）
- 非 Mock 会话能返回真实模型回复
- `ciro web --mock` 仍可不依赖 Key

## 失败时

| 现象 | 处理 |
|------|------|
| 无 Key / 模型不可用 | 查环境变量是否在**同一终端**导出；或改用设置页 |
| Base URL 被拒 | 换公网 HTTPS；勿用未允许的 `127.0.0.1` |
| 超时 / 401 | 核对 Key、套餐额度、公司代理 |
| 只想验证 UI | `--mock`，见 [排障](/guides/troubleshooting/) |

## 接下来

- [快速开始](/getting-started/quickstart/) · [工作模式](/guides/modes/) · [配置优先级](/reference/config/) · [数据与隐私](/concepts/data-and-privacy/)
