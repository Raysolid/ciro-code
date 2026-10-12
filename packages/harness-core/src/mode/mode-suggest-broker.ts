import { randomUUID } from 'node:crypto';
import { MODE_SUGGEST_TIMEOUT_MS, type HarnessMode } from '@ciro-code/harness-shared';

export type ModeSuggestDecision = 'switch' | 'skip';

export interface ModeSuggestRequest {
  id: string;
  sessionId: string;
  suggestedMode: HarnessMode;
  currentMode: HarnessMode;
  reason: string;
}

interface Pending {
  request: ModeSuggestRequest;
  resolve: (decision: ModeSuggestDecision) => void;
}

export { MODE_SUGGEST_TIMEOUT_MS };

/**
 * 模式建议同步门闩：推送 SSE 后挂起，直至 UI resolve 或超时 skip。
 * 形态对齐 PermissionBroker。同 session 已有 pending 时拒绝新请求。
 */
export class ModeSuggestBroker {
  private readonly pending = new Map<string, Pending>();
  private onRequest: ((req: ModeSuggestRequest) => void) | null = null;

  setRequestHandler(handler: ((req: ModeSuggestRequest) => void) | null): void {
    this.onRequest = handler;
  }

  /** 同 session 是否已有未 resolve 的建议 */
  hasPendingForSession(sessionId: string): boolean {
    for (const item of this.pending.values()) {
      if (item.request.sessionId === sessionId) return true;
    }
    return false;
  }

  async requestApproval(
    req: Omit<ModeSuggestRequest, 'id'>,
    timeoutMs = MODE_SUGGEST_TIMEOUT_MS,
  ): Promise<{ id: string; decision: ModeSuggestDecision }> {
    if (this.hasPendingForSession(req.sessionId)) {
      throw new Error('MODE_SUGGEST_BUSY: A mode suggestion is already pending for this session');
    }

    const id = randomUUID();
    const full: ModeSuggestRequest = { ...req, id };

    return new Promise<{ id: string; decision: ModeSuggestDecision }>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ id, decision: 'skip' });
        }
      }, timeoutMs);

      this.pending.set(id, {
        request: full,
        resolve: (decision) => {
          clearTimeout(timer);
          resolve({ id, decision });
        },
      });
      this.onRequest?.(full);
    });
  }

  resolve(id: string, decision: ModeSuggestDecision): boolean {
    const item = this.pending.get(id);
    if (!item) return false;
    this.pending.delete(id);
    item.resolve(decision);
    return true;
  }

  getPending(id: string): ModeSuggestRequest | undefined {
    return this.pending.get(id)?.request;
  }

  /** 中止会话时全部 skip */
  rejectAll(sessionId?: string): void {
    for (const [id, item] of this.pending) {
      if (sessionId && item.request.sessionId !== sessionId) continue;
      this.pending.delete(id);
      item.resolve('skip');
    }
  }
}
