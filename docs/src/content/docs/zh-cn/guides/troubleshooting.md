---
title: 排障
description: 优先覆盖 Windows 的安装、PATH 与端口问题。
---

## 找不到 `ciro`（Windows）

1. 优先使用 **pwsh**（PowerShell 7）。
2. 重新安装：`npm install -g @ciro-code/code`
3. 确认 `npm prefix -g` 在 `PATH` 中
4. 新开一个终端

## 装错包

若安装了无作用域的 `ciro`，请卸载后改用：

```bash
npm install -g @ciro-code/code
```

## 端口被占用

默认端口 **3080**。

```powershell
netstat -ano | findstr 3080
```

换端口：`ciro web -p 3081`，或结束占用 3080 的进程。

## 健康检查失败

```bash
ciro web --mock --no-open
```

然后：

```bash
curl http://127.0.0.1:3080/health
```

应看到含 `"status":"ok"` 的 JSON。若进程立刻退出，查看终端报错（Node 版本、权限等）。

## 无 API Key 警告

真实模型需要 Key 或设置页 Provider。可用 `--mock`，或设置 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` — 见 [配置模型](/getting-started/first-provider/)。

## ExecutionPolicy 报错

```powershell
Get-ExecutionPolicy -List
```

CLI 请用 npm 全局安装。仅在环境允许时调整 ExecutionPolicy，勿随意关闭安全默认。

## 仍无法解决

执行：

```bash
ciro doctor -w .
ciro debug -w .
```

向 Issue 反馈时请打码密钥后再粘贴输出。
