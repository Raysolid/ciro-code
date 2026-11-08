---
title: 工作模式
description: Ask、Plan、Agent、Debug——各模式允许什么、何时使用。
---

**模式**与**模型**是两回事：

- **模式** — 允许哪些工具、能不能写文件（Harness）  
- **模型** — 谁来推理（**设置 → 模型**）

## 对照

| 模式 | 意图 | 常见工具 | 你应核对 |
|------|------|----------|----------|
| **Ask** | 探索架构与文档 | `read`、`list_files`、`grep`、只读向 `bash`、`WebFetch` | 无写入；Changes 为空 |
| **Plan** | 改码前做方案 | Ask 工具 + 计划工具；源码写入关闭 | 审阶段划分与影响面 |
| **Agent** | 实现并验证 | `edit`、`write`、白名单 `bash` | 看 Changes Diff；按提示审批 |
| **Debug** | 最小改动范围修失败 | 读写改 + 定向探测 | 盯住失败假设 |

## 推荐流水线

```text
Ask → Plan → Agent → Debug（按需）
```

1. **Ask** — 零风险摸清仓库  
2. **Plan** — 结构化计划；文件仍不可写  
3. **Agent** — 在沙箱与白名单下落地  
4. **Debug** — 测试失败时贴栈，要最小补丁  

## 如何切换

- Web：顶栏模式标签  
- 键盘：`Shift+Tab`  
- Slash：`/mode ask|plan|agent|debug`  
- CLI：`ciro web --mode ask`  
- 工作区默认：`{workspace}/.ciro/config.yaml` 里写 `mode: ask`

## 接下来

[权限](/guides/permissions/) · [探索代码库](/workflows/explore-codebase/) · [规划一次改动](/workflows/plan-a-change/) · [工作原理](/concepts/how-it-works/)
