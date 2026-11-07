---
title: 配置
description: 配置落盘位置、合并优先级与查看生效值。
---

## 优先级（后覆盖前）

同名字段按下列顺序合并，**越靠后优先级越高**：

1. 内置默认值  
2. 用户配置 — `~/.ciro/config.yaml`（及同目录下的 `providers.json`、`credentials/` 等）  
3. 工作区配置 — `{workspace}/.ciro/config.yaml`  
4. 环境变量 — 如 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`CIRO_AGENT_BACKEND`、`CIRO_PORT`  
5. CLI 标志 — 如 `--mode`、`--profile`、`-w`、`-p`

查看生效结果与来源：

```bash
ciro config show -w .
ciro config effective -w .
ciro config validate -w .
```

## 位置速查

| 层 | 路径 / 来源 |
|----|-------------|
| 用户 | `~/.ciro/` |
| 工作区 | `{workspace}/.ciro/` |
| 环境 | Shell 环境变量 |
| CLI | `ciro` / `ciro web` 选项 |

数据目录含义见 [数据与隐私](/concepts/data-and-privacy/) · [工作区与会话](/guides/workspace-session/)。

## 起始片段

```bash
ciro config wizard -w .
```

示例（只读起步）：

```yaml
mode: ask
tools: [read, list_files, grep]
permissions:
  preset: workspace-readonly
```

需要改文件时再切到 Agent（`mode: agent`、写入类工具与可写预设）。日常优先用工作台 **设置** 页修改。

## 端口

Web 默认端口为 **5280**（避开部分 Windows 保留段）。可用 `-p` 或 `CIRO_PORT` 覆盖。

## 密钥

见仓库 [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md)。切勿把密钥提交进 Git。
