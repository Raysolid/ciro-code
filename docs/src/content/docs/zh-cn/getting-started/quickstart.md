---
title: 快速开始
description: 打开本地工作台，几分钟内完成第一次真实编码任务。
---

本指南帮助你在 5 分钟内完成：启动本地工作台、选定项目、连接模型，并端到端跑完你的第一个编码任务。

## 1. 启动工作台

在已安装 Node.js 20+ 的终端中执行（若未安装请先看 [安装指南](/getting-started/install/)）：

```bash
ciro web
```

启动后终端将输出服务地址并自动唤起默认浏览器：

```text
✓ Ciro Kernel initialized (mode: ask, policy: workspace-balanced)
✓ Local Web Workbench running at http://127.0.0.1:3080
Opening browser...
```

若暂时没有大模型 API Key，可以先开启 Mock 模式安全熟悉界面：

```bash
ciro web --mock
```

浏览器将打开 [http://127.0.0.1:3080](http://127.0.0.1:3080)。如果不希望自动打开浏览器，可追加 `--no-open` 参数。

## 2. 选定项目工作区

在未选定工作区之前，底部的输入框处于安全锁定状态，防止盲目执行。

- **方式一（界面选择）**：点击工作台居中的提示卡片或侧边栏顶部的 **+** 按钮，在弹出的文件树选择你的本地项目根目录。
- **方式二（启动时指定）**：在终端启动时直接通过 `-w` 传入项目路径：
  ```bash
  ciro web -w D:/workspace/my-app
  ```

## 3. 连接模型（使用 Mock 可跳过）

要在实际开发中获得 AI 推理，需配置模型连接：

1. 点击工作台左下角 **设置 → 模型 (Providers)**。
2. 添加你的模型提供商（如 DeepSeek、OpenAI、Ollama 或任意兼容端点），填入 API Key 并启用模型。
3. 你的 API Key 仅保存在本机的 `~/.ciro/` 目录下，绝不上传到任何云端中转服务器。

也可在终端启动前通过环境变量快捷注入：
```bash
export DEEPSEEK_API_KEY="sk-..."  # Windows pwsh: $env:DEEPSEEK_API_KEY="sk-..."
```
详见 [连接模型指南](/getting-started/first-provider/)。

## 4. 执行你的第一个任务

工作台顶部的模式栏默认处于 **Ask**（只读探索）模式。

### 场景 A：探索与分析陌生代码（Ask 模式）

在底部输入框输入如下指令测试代码理解：

> 请阅读项目的 `package.json` 与主入口文件，总结该项目的技术栈与主要模块结构。

Ciro 会在发送第一条消息时自动创建会话，扫描相关文件并在工作台右侧展示思考过程与分析结论，整个过程严格只读。

### 场景 B：小步实现与自动化测试（Agent 模式）

若需要让 Ciro 动手编写代码，点击顶部模式栏切换到 **Agent** 模式，然后尝试具体需求：

> 为 `src/utils/math.ts` 中的 `calculateTotal` 函数编写单测，并自动运行 `npm test` 验证。

在 Agent 模式下，Ciro 会在策略沙箱内读写文件、执行单测命令，并在控制台实时回传测试执行结果。

## 5. 审查变更（Changes 面板）

当 Agent 模式修改了文件时，工作台将高亮提示 **Changes**：

1. 点击 **Changes** 标签页，以直观的 Side-by-Side 或 Inline Diff 形式核对代码改动。
2. 确认改动符合预期且测试通过后，即可在终端使用常规 Git 流程进行提交。

## 接下来

- 深入理解四档权限边界：[工作模式](/guides/modes/)
- 通过 npm 扩展工作台能力：[扩展 Pack](/guides/packs/)
- 遇到环境或端口问题？查看 [Windows / 常见排障](/guides/troubleshooting/)
