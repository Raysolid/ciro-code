---
title: 安装
description: 在 Windows / macOS / Linux 上用 npm 安装 Ciro Code。
---

## 要求

- **Node.js 20+**
- npm（随 Node 附带）

## 安装

```bash
npm install -g @ciro-code/code
```

CLI 命令为 `ciro`。`@ciro-code/cli` 为等价包（同一 `bin`）。

```bash
ciro --help
ciro web
```

默认工作台：[http://127.0.0.1:3080](http://127.0.0.1:3080) · 健康检查：`/health`。

:::caution
请安装作用域包 `@ciro-code/code`。不要使用 `npm i -g ciro`。
:::

## Windows（推荐 pwsh）

优先使用 **PowerShell 7（`pwsh`）**，而不是 Windows PowerShell 5.1。

```powershell
npm install -g @ciro-code/code
ciro --help
ciro web --mock --no-open
```

另开终端：

```powershell
curl http://127.0.0.1:3080/health
```

### ExecutionPolicy

若脚本因执行策略失败，先查看当前策略：

```powershell
Get-ExecutionPolicy -List
```

仅在组织允许时调整策略。日常使用优先通过上面的 `npm` 安装，一般无需放宽脚本策略。

### PATH

全局安装后若找不到 `ciro`：

1. 查看全局前缀：`npm prefix -g`
2. 确认该前缀下的可执行目录已在 `PATH` 中
3. 安装后**重新打开**终端
4. 必要时再执行一次 `npm install -g @ciro-code/code`

### 端口 3080

`ciro web` 默认端口为 **3080**。若被占用：

```powershell
netstat -ano | findstr 3080
```

结束占用进程，或换端口：`ciro web -p 3081`。

## 冒烟（无需 API Key）

```bash
ciro web --mock --no-open
```

然后访问 `http://127.0.0.1:3080/health`，确认返回成功。
