---
title: 模式
description: Ask / Plan / Agent / Debug — 工作流与权限。
---

模式控制**工作流与工具权限**。模型选择（Provider + 模型 id）在设置中单独配置。

| 模式 | 意图 | 典型能力 |
|------|------|----------|
| **Ask** | 解释与探索，不做修改 | 偏只读；Task 仅 explore |
| **Plan** | 设计变更计划 | explore / verify / shell（无 browser） |
| **Agent** | 落地实现 | write / edit / shell；Playwright MCP 就绪时可 browser |
| **Debug** | 排查问题 | 接近 Agent，偏诊断 |

在工作台切换模式，或用 CLI：

```bash
ciro web --mode ask
ciro web --mode agent
```

提交前务必查看 **Changes**。不确定时用 Ask/Plan；需要改文件时再用 Agent。
