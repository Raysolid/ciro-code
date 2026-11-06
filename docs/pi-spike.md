# Pi SDK Spike 记录

> Phase 0 · D2 · 版本 `@earendil-works/pi-coding-agent@0.84.4`

## 结论

Pi SDK 可用于 headless Harness 集成，核心 API 稳定：

```typescript
import { createAgentSession, defineTool, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent';

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  cwd: workspace,
  tools: ['read'],
  noTools: 'builtin',       // 禁用内置 read/write/edit/bash
  customTools: [readTool],  // 使用沙箱版 read
  sessionManager: SessionManager.inMemory(),
  modelRuntime,
});

session.subscribe((event) => { /* 映射 SSE */ });
await session.prompt('Read README.md');
await session.agent.waitForIdle();
```

## 关键发现

| 项 | 说明 |
|----|------|
| 工具隔离 | `noTools: 'builtin'` + `customTools` 可替换内置 read，便于接入 PathSandbox |
| 流式事件 | `message_update.text_delta` → token；`tool_execution_*` → tool_call |
| 认证 | `ModelRuntime.create()` 自动读 env（`DEEPSEEK_API_KEY` / `OPENAI_API_KEY`） |
| Session | `SessionManager.inMemory()` 适合 Phase 0；文件持久化 Phase 2 |
| 版本锁定 | 使用 `=0.84.4` 精确锁版本，避免 upstream breaking change |

## 风险

- Pi 事件类型无公开 TS 导出到 harness 层，adapter 内订阅即可（符合 AgentRuntime 隔离原则）
- `session.abort()` 需确认 SDK 版本是否暴露；Phase 0 可 no-op

## 参考

- [Pi SDK 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- 设计方案 §2.2 AgentRuntime 抽象
