---
title: 配置模型
description: 配置 API Key，或用 --mock 先体验界面。
---

真实对话需要模型服务商。也可先用 Mock 浏览界面。

## 方式 A — Mock（无 Key）

```bash
ciro web --mock
```

Mock 不会调用远程模型，适合验证安装、选工作区与布局。

## 方式 B — 环境变量

```bash
# bash / zsh
export DEEPSEEK_API_KEY=your_key
# 或
export OPENAI_API_KEY=your_key
```

```powershell
# pwsh
$env:DEEPSEEK_API_KEY = "your_key"
# 或
$env:OPENAI_API_KEY = "your_key"
```

然后：

```bash
ciro web
```

## 方式 C — 设置页

1. 启动 `ciro web`（用 Mock 也可打开设置）。
2. 打开 **设置 → 模型**。
3. 添加 Provider、粘贴 Key、拉取模型并启用。
4. Key 保存在本机 `~/.ciro/`（见 [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)）。

切勿把真实密钥提交到 git 或贴进公开 Issue。
