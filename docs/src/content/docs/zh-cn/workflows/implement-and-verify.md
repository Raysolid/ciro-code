---
title: 实现并验证
description: 在 Agent 模式下受控改码，自动跑测，并在 Changes 中核对 Diff。
---

**Agent 模式**用于实际改码：Kernel 在 `workspace-write` 策略下可在路径沙箱内编辑、跑白名单命令，并按测试结果自修正。

---

## 实现流程

```mermaid
flowchart LR
  A[目标 + 验证命令] --> B[沙箱内改码]
  B --> C[自动跑测]
  C --> D[审阅 Changes]
  D --> E[本地 Git 提交]
```

### 1. 切换到 Agent
顶栏点 **Agent**，或 `Shift + Tab`，或 `/mode agent`。

### 2. 给出可验证指令

好提示词包含：**目标 + 范围 + 验证命令**。可复制改写：

```text
为 @src/utils/format.ts 中的 formatCurrency 增加国际化货币符号配置。

要求：
1. 在 @tests/utils/format.test.ts 补充单元测试；
2. 自动运行 npm test -- format，确认全部通过；
3. 若有失败自行修复，全部通过后再停止。
```

### 3. 人工审批
执行中：
- **白名单命令**（如 `git status`、`npm test`）自动放行并流式展示日志；
- **敏感或未知命令**（装依赖、改构建脚本、越界路径等）会暂停并弹出审批：允许一次 / 记住并允许 / 拒绝。

### 4. 在 Changes 核对 Diff
- **并排对比**：查看增删行；
- **范围确认**：确认未顺带改无关格式或加多余依赖；
- **回退**：偏离预期时可在面板逐文件撤销。

### 5. 本地提交
验证通过后按你的常规 Git 流程提交：

```bash
git add src/ tests/
git commit -m "feat(utils): add international currency formatting"
```

---

## 常见误区

- ❌ **一次塞过大任务**：如「整仓改成 TypeScript」，应拆成可验证的小步；
- ❌ **不带验证命令**：缺少 `npm test` 等，难以发现细微运行时错误；
- ❌ **未看 Diff 就 push**：先在 Changes 核对再推远程。

---

## 接下来

- 难复现失败：[排查失败](/workflows/debug-a-failure/)
- Shell 白名单：[权限与安全](/guides/permissions/)
- Changes 交互：[Web 工作台](/surfaces/web-workbench/)
