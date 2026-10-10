---
title: 快速开始
description: 从安装到首次会话与 Changes。
---

## 1. 安装

```bash
npm install -g @ciro-code/code
```

## 2. 启动工作台

暂无模型 Key（仅 UI）：

```bash
ciro web --mock
```

已配置模型后（见 [配置模型](/getting-started/first-provider/)）：

```bash
ciro web
```

CLI 会打印工作台地址（默认 [http://127.0.0.1:3080](http://127.0.0.1:3080)），并打开浏览器（除非使用 `--no-open`）。

## 3. 选择工作区

若尚未选择工作区，通过居中输入区或侧栏 **+** 选择本机目录。未传 `-w` 时，下次启动会尽量恢复最近工作区。

也可在 CLI 指定：

```bash
ciro web -w /path/to/your/project
```

## 4. 发送第一条消息

在输入框发送简短任务。会话在**第一条消息**发送时创建。

**Ask** 模式偏只读；需要改代码时切换到 **Agent**（见 [模式](/guides/modes/)）。

## 5. 查看 Changes

Agent 修改文件后，在工作台打开 **Changes** 查看 diff，再自行用 git 提交。

## 下一步

- [模式](/guides/modes/)
- [排障](/guides/troubleshooting/)
