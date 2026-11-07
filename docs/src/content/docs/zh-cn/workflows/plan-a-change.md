---
title: 规划一次改动
description: 用 Plan 模式先出步骤，批准后再落地。
---

## 开始前

- 已用 [探索](/workflows/explore-codebase/) 或自有知识摸清相关模块
- 改动跨多文件或风险较高时再用 Plan；小而明确的修补可直接 [实现](/workflows/implement-and-verify/)

## 步骤

1. 切到 **Plan**：
   ```bash
   ciro web -w . --mode plan
   ```
   或在工作台 / TUI 用模式切换（如 `Shift+Tab`）。
2. 说明目标、约束与验收标准，例如：  
   「统一启动路径的错误处理：定位全部 catch，用 AppError 包装；先给分步计划，不要改源文件。」
3. 审阅计划：步骤是否可测、影响面是否过大、有无遗漏测试。
4. 不满意就继续对话改计划；满意后再切 **Agent** 按计划执行。

## 成功时你应看到

- 产出分步计划 / 计划卡片；源文件仍无写入（Plan 为规划向、只读落地）
- 你能指出「先做哪一步、如何验收」

## 失败时

- 模型直接开始改文件 → 确认仍在 Plan；见 [工作模式](/guides/modes/)
- 计划太空 → 补充约束、`@` 关键文件、要求列出将改路径

## 接下来

[实现并验证](/workflows/implement-and-verify/) · [权限与安全](/guides/permissions/)
