---
title: 快速开始
description: 打开工作台，几分钟内完成第一次任务。
---

目标：装好（如需要）、打开工作台、选中项目，并跑完一条真实任务。

## 1. 打开工作台

若还没有 `ciro`，先看 [安装](/getting-started/install/)，然后：

```bash
ciro web
```

还没有 API Key？可以先安全地看界面：

```bash
ciro web --mock
```

浏览器应打开 [http://127.0.0.1:3080](http://127.0.0.1:3080)。不想自动打开时加 `--no-open`。

## 2. 选择工作区

未选文件夹前，输入框是锁定的。

- 点居中提示或侧栏 **+**，选你的项目目录
- 或启动时指定：`ciro web -w /path/to/your/project`

## 3. 连接模型（Mock 可跳过）

打开 **设置 → 模型**，添加 Provider 与 Key，并启用模型。

也可以在启动前设置 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`。详见 [连接模型](/getting-started/first-provider/)。

## 4. 跑第一条任务

先用 **Ask** 做只读了解。可以试试：

> 总结这个仓库，并列出主要的包/模块。

发送后，Ciro 会在第一条消息时创建会话。

需要改代码？切到 **Agent**，再提一个小而具体的改动。见 [工作模式](/guides/modes/)。

## 5. 查看 Changes

如果有文件被改动，打开工作台里的 **Changes**，核对 diff，再用你自己的 git 流程提交。

## 接下来

常用页面：[工作模式](/guides/modes/) · [扩展 Pack](/guides/packs/) · [常见问题](/guides/troubleshooting/)
