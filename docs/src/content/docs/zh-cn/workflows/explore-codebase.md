---
title: 探索代码库
description: 用 Ask 模式只读摸清陌生仓库。
---

## 开始前

- 已 [安装](/getting-started/install/) `ciro`
- 打开目标仓库根目录（或 `-w` 指向它）
- 有模型，或使用 `--mock` 熟悉流程

## 步骤

1. 以只读模式启动：
   ```bash
   ciro web -w . --mode ask
   # 或：ciro --mode ask
   ```
2. 确认顶栏 / 状态为 **Ask**（`Shift+Tab` 可切换）。
3. 用具体问题开场，例如：
   - 「这个仓库的入口与主要模块是什么？」
   - 「认证流程从哪个文件开始？」
   - 「`package.json` 里有哪些脚本，本地怎么跑测试？」
4. 需要定点阅读时，用 `@路径` 把文件拉进上下文。
5. 根据回复继续追问边界与依赖，**不要**在 Ask 下要求改文件。

## 成功时你应看到

- 工具调用以检索 / 读取为主
- 工作区文件无改动；Changes 为空或不出现写入

## 失败时

- 权限拒绝写入以外的报错 → [排障](/guides/troubleshooting/)
- Agent 开始改文件 → 切回 Ask，或检查是否误开了可写模式

## 接下来

摸清现状后：[规划一次改动](/workflows/plan-a-change/) · [实现并验证](/workflows/implement-and-verify/)
