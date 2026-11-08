---
title: 排查失败
description: 用 Debug 模式做假设驱动排查，定位根因并做最小修复。
---

单测失败、偶发异常或难读堆栈时，直接让 Agent「随便修」容易牵连无关重构。**Debug 模式**要求先列假设、再验证、再最小改动，把修改范围压到复现与根因附近。

---

## 排障四步

```mermaid
flowchart LR
  A[贴完整报错] --> B[列出 2～3 个假设]
  B --> C[定向验证与最小修复]
  C --> D[重跑复现命令]
```

### 1. 切换到 Debug
顶栏选 **Debug**，或输入 `/mode debug`。

### 2. 提供报错与复现命令

复制下面提示词，换成你的命令与堆栈：

```text
运行命令 npm test -- user-service 失败。

复现命令：
npm test -- tests/services/user.test.ts -t "should handle token expiry"

完整报错输出：
TypeError: Cannot read properties of undefined (reading 'refreshToken')
    at AuthService.verifyToken (src/services/auth.ts:42:18)
    at UserService.getUser (src/services/user.ts:15:31)

要求：
1. 先列出导致此失败的 2～3 个可能假设；
2. 定位根因，只做最小修复；
3. 禁止无关重构，只改根因相关代码；
4. 重新运行上述复现命令，直到测试通过。
```

### 3. 审阅假设
动手改码前，Agent 应先给出思考过程，例如：
- **假设 1**：Token 格式异常或被提前清除，payload 为 undefined；
- **假设 2**：Mock 数据缺少 `refreshToken`；
- **验证**：阅读 `src/services/auth.ts:42` 等处，确认哪条成立。

### 4. 审查 Diff 并清理调试痕迹
在右侧 **Changes** 核对：
- [ ] 改动是否尽量少（常见是几行空值防护或逻辑判断）？
- [ ] 是否留下临时 `console.log`？（会话日志可能已清，源文件仍要看一眼）
- [ ] 同一复现命令已通过。

---

## 常见误区

- ❌ **只说「测试挂了，帮我修」**：没有复现命令和完整堆栈，容易盲改无关文件；
- ❌ **顺带重构**：排障时禁止顺手改风格或重写整函数，否则会掩盖真正回归；
- ❌ **修好却不补防回归**：若原测试未覆盖该边界，让 Agent 补上对应断言。

---

## 接下来

- 日常实现：[实现并验证](/workflows/implement-and-verify/)
- 环境与端口：[排障指南](/guides/troubleshooting/)
- 模式说明：[工作模式](/guides/modes/)
