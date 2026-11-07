---
title: 实现并验证
description: 在 Agent 模式下受控改码，并用测试 / Diff 核对。
---

## 开始前

- 任务范围清楚，或已有 [计划](/workflows/plan-a-change/)
- 了解工作区 [权限](/guides/permissions/)（默认 Agent 为可写策略 + 敏感操作审批）
- 知道本地如何跑测试（如 `npm test`）

## 步骤

1. 切到 **Agent**：
   ```bash
   ciro web -w . --mode agent
   ```
2. 给出可验证目标，例如：  
   「按计划改 `src/…`，跑 `npm test`，失败则修好再停。」
3. 关注工具调用与审批弹窗；敏感 Shell / 越界路径需你确认。
4. 打开 **Changes**（Web）核对 Diff；必要时让 Ciro 再跑测试或缩小改动。
5. 用本机 Git 提交；不要在未审 Diff 时直接推远程。

## 成功时你应看到

- Changes 中的 Diff 与目标一致
- 约定的检查命令已跑过且结果符合预期（或失败原因已解释）

## 失败时

- 权限拒绝 → 收紧或调整白名单，见 [权限](/guides/permissions/)
- 测试红 → 留在 Agent 修，或转 [排查失败](/workflows/debug-a-failure/)
- Diff 过大 → 要求拆步、回退无关文件

## 接下来

[排查失败](/workflows/debug-a-failure/) · [Web 工作台](/surfaces/web-workbench/) · [扩展选型](/customize/chooser/)
