---
title: 排查失败
description: 用 Debug 模式做假设驱动的最小修复。
---

## 开始前

- 能稳定复现：失败命令、报错栈或红测输出
- 已知大致相关路径（可用 Ask 先定位）

## 步骤

1. 切到 **Debug**：
   ```bash
   ciro web -w . --mode debug
   ```
2. 粘贴复现步骤与完整错误，例如：  
   「运行 `npm test -- auth` 失败，栈如下。先给假设，再做最小修复并验证。」
3. 要求 Ciro：**列假设 → 选最可能的 → 最小改动 → 再跑同一命令**。
4. 在 Changes 审 Diff；拒绝无关重构。
5. 通过后切回 Ask/Agent 做收尾，或提交。

## 成功时你应看到

- 假设与验证步骤写清楚
- Diff 集中在根因路径；同一复现命令结果改善或通过

## 失败时

- 仍无法复现 → 补充环境、分支、相关 `@` 文件
- 改动面失控 → 明确「禁止重构，只修当前失败」；必要时回退 Diff 重来
- 权限挡住必要命令 → [权限](/guides/permissions/)

## 接下来

[实现并验证](/workflows/implement-and-verify/) · [工作模式](/guides/modes/) · [排障](/guides/troubleshooting/)
