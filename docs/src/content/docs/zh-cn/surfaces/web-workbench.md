---
title: Web 工作台
description: 本地 Web 界面的布局、Composer、Changes 与设置入口。
---

Web 工作台是日常主入口：看 Diff、切模式、管 Provider / Pack，都在浏览器里完成。

## 启动

```bash
ciro web
ciro web -w /path/to/project
ciro web --mock          # 无 API Key 先逛界面
ciro web --no-open       # 不自动打开浏览器
```

默认地址：`http://127.0.0.1:5280`（`-p` 可改）。健康检查：`GET /health`。

## 界面地图

| 区域 | 做什么 |
|------|--------|
| 侧栏 | 工作区、会话列表、新会话 |
| 顶栏 / 模式 | Ask · Plan · Agent · Debug |
| 主对话区 | 思考过程、工具调用、回复 |
| 右侧面板 | 文件树、**Changes**（Diff）等 |
| 底部 Composer | 发消息；`/` 命令、`@` 引用文件 |
| 设置 | 模型、权限、MCP、Feature packs |

未选定工作区时，Composer 处于锁定，避免误操作。

## 一次典型操作

1. 选定或传入工作区（`-w`）
2. 需要推理时配置 [模型](/getting-started/first-provider/)（或继续用 `--mock`）
3. 按风险选 [模式](/guides/modes/)
4. 在 Composer 描述任务；Agent 改码后打开 **Changes** 审 Diff
5. 用本机 Git 提交（或启用 Git Pack 辅助）

## 与 TUI 的关系

| | Web | TUI（`ciro` / `ciro tui`） |
|--|-----|---------------------------|
| 内核 / 模式 / 权限 | 相同 | 相同 |
| Diff / 设置 UI | 更完整 | 终端内为主 |
| 默认场景 | 长时间看改动、配 Provider | 留在终端里的全屏会话 |

详见 [终端界面](/surfaces/terminal-tui/) · [快捷键](/reference/shortcuts/)。

## 成功时你应看到

- 浏览器打开工作台，侧栏显示当前工作区
- Composer 可发送；Ask 任务不产生项目文件 Diff
- Agent 任务后 Changes 出现改动

## 失败时

- 端口占用 / 健康检查失败 → [排障](/guides/troubleshooting/)
- 找不到 `ciro` → [安装](/getting-started/install/)

## 接下来

- [快速开始](/getting-started/quickstart/) · [探索代码库](/workflows/explore-codebase/) · [实现并验证](/workflows/implement-and-verify/)
