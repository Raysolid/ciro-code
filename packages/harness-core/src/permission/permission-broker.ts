import { randomUUID } from 'node:crypto';
import type { HarnessMode } from '@ciro/harness-shared';

export interface PermissionRequest {
  id: string;
  sessionId: string;
  mode: HarnessMode;
  toolName: string;
  toolInput?: Record<string, unknown>;
  reason?: string;
  /** 与时间线 tool 卡 id 对齐，供 UI 按 id 匹配 */
  toolCallId?: string;
}

type Decision = 'allow' | 'deny';

interface Pending {
  request: PermissionRequest;
  resolve: (decision: Decision) => void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class PermissionBroker {
  private readonly pending = new Map<string, Pending>();
  private onRequest: ((req: PermissionRequest) => void) | null = null;

  setRequestHandler(handler: ((req: PermissionRequest) => void) | null): void {
    this.onRequest = handler;
  }

  async requestApproval(
    req: Omit<PermissionRequest, 'id'>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Decision> {
    const id = randomUUID();
    const full: PermissionRequest = { ...req, id };

    return new Promise<Decision>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve('deny');
        }
      }, timeoutMs);

      this.pending.set(id, {
        request: full,
        resolve: (decision) => {
          clearTimeout(timer);
          resolve(decision);
        },
      });
      this.onRequest?.(full);
    });
  }

  resolve(id: string, decision: Decision): boolean {
    const item = this.pending.get(id);
    if (!item) return false;
    this.pending.delete(id);
    item.resolve(decision);
    return true;
  }

  getPending(id: string): PermissionRequest | undefined {
    return this.pending.get(id)?.request;
  }

  listPending(sessionId?: string): PermissionRequest[] {
    const all = [...this.pending.values()].map((p) => p.request);
    return sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
  }

  /** 中止会话时拒绝所有挂起权限 */
  rejectAll(sessionId?: string): void {
    for (const [id, item] of this.pending) {
      if (sessionId && item.request.sessionId !== sessionId) continue;
      this.pending.delete(id);
      item.resolve('deny');
    }
  }
}
