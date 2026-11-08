---
title: CLI
description: ciro 命令参考。
---

```bash
ciro --help
ciro -V
```

无子命令时默认启动 **TUI**（与 `ciro tui` 相同）。Web 工作台用 `ciro web`。

## `ciro` / `ciro tui`

全屏终端会话。

| 选项 | 说明 |
|------|------|
| `-w, --workspace <path>` | 工作区根（默认当前目录） |
| `--mode <mode>` | `ask` \| `plan` \| `agent` \| `debug` |
| `--mock` | Mock Agent |
| `--continue` | 续最近会话 |
| `--resume <id>` | 续指定会话 |
| `--profile <id>` | Profile 叠加 |
| `--minimal` | 无 alternate screen |

```bash
ciro
ciro --mode ask --mock
ciro tui -w ./my-app
```

## `ciro web`

启动本地工作台服务。

| 选项 | 说明 |
|------|------|
| `-w, --workspace <path>` | 工作区根（省略则恢复最近一次） |
| `-p, --port <number>` | 端口（默认 `5280`） |
| `--mode <mode>` | 初始模式：`ask` \| `plan` \| `agent` \| `debug` |
| `--profile <id>` | Profile 叠加（如 `developer`） |
| `--no-open` | 不打开浏览器 |
| `--mock` | Mock Agent（无需 API Key） |

```bash
ciro web
ciro web --mock --no-open
ciro web -w . -p 5280 --mode ask
```

## `ciro pack`

安装官方 Feature Pack（`@ciro-code/ext-*`）。见 [Feature Packs](/guides/packs/)。

```bash
ciro pack add @ciro-code/ext-git
ciro pack list
ciro pack remove @ciro-code/ext-git
```

安装**不会**启用 Pack — 请到设置 → Feature packs。  
本地官方目录：`ciro pack add @ciro-code/ext-git --from ./packages/ext-git`。

## `ciro init`

复制示例工作区。

```bash
ciro init --example react-ts
ciro init --example node-api -d ./my-app --force
```

## `ciro config`

| 子命令 | 说明 |
|--------|------|
| `show` | 生效配置与来源（`-w`、`--mode`、`--profile`） |
| `effective` | 生效配置 JSON |
| `validate` | 校验生效配置 |
| `wizard` | 打印推荐的起始 `config.yaml` |

```bash
ciro config show -w .
ciro config validate -w .
```

## `ciro doctor`

检查 `.ciro` / 旧 `.pi` 产品目录。

```bash
ciro doctor -w .
```

## `ciro migrate`

将旧 `.pi` / `~/.pi/agent` 数据复制到 `.ciro` / `~/.ciro`（不删除旧文件）。

```bash
ciro migrate
ciro migrate -w .
```

## `ciro debug`

输出环境、配置、冒烟相关字段与近期审计。

```bash
ciro debug -w .
```
