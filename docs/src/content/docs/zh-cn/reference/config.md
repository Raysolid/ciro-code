---
title: 配置
description: 配置位置与合并顺序。
---

## 位置

| 层 | 路径 |
|----|------|
| 环境变量 | `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`CIRO_AGENT_BACKEND` 等 |
| 用户 | `~/.ciro/config.yaml`、`providers.json`、`credentials/` |
| 工作区 | `{workspace}/.ciro/config.yaml` |
| CLI | `--mode`、`--profile`、`-w` 等 |

同名字段由更后层覆盖。查看生效配置：

```bash
ciro config show -w .
ciro config effective -w .
```

## 起始片段

```bash
ciro config wizard -w .
```

示例：

```yaml
mode: ask
tools: [read, list_files, grep]
permissions:
  preset: workspace-readonly
```

需要改文件时再切到 agent（`mode: agent`、写入类工具与可写预设）。优先用设置页修改。

## 密钥

见 [Security](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。切勿提交密钥。
