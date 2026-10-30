import type { ContextUsageSnapshot } from '@ciro-code/harness-shared';
import type { ContextAccountant, ContextParts } from './context-accountant.js';

/** 对齐 Cursor 等产品：流式回合内更新 usage，避免 SSE 过密 */
export const CONTEXT_USAGE_LIVE_MIN_INTERVAL_MS = 500;

export interface LiveContextUsageEmitter {
  /** token / thinking 增量：节流推送 */
  schedule(): void;
  /** tool_result 等：立即推送 */
  flush(): void;
  dispose(): void;
}

/**
 * 回合内 live 会计：conversation 用「已落盘文本 + 进行中助手草稿」估数，
 * 不调用 appendConversation，避免回合结束重复计入。
 */
export function createLiveContextUsageEmitter(opts: {
  context: ContextAccountant;
  sessionId: string;
  minIntervalMs?: number;
  /** 静态桶 + toolPayloadTokens；conversation 由 emitter 合成 */
  getStaticParts: () => Omit<ContextParts, 'conversation'>;
  getInFlightAssistantText: () => string;
  onSnapshot: (snap: ContextUsageSnapshot) => void;
}): LiveContextUsageEmitter {
  const minIntervalMs = opts.minIntervalMs ?? CONTEXT_USAGE_LIVE_MIN_INTERVAL_MS;
  let lastEmitAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastEmitAt = Date.now();
    const base = opts.context.getConversation(opts.sessionId);
    const assistant = opts.getInFlightAssistantText();
    const conversation = assistant ? `${base}\nAssistant: ${assistant}` : base;
    const snap = opts.context.refresh(opts.sessionId, {
      ...opts.getStaticParts(),
      conversation,
    });
    opts.onSnapshot(snap);
  };

  return {
    schedule() {
      const elapsed = Date.now() - lastEmitAt;
      if (elapsed >= minIntervalMs) {
        emit();
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        emit();
      }, minIntervalMs - elapsed);
    },
    flush() {
      emit();
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
