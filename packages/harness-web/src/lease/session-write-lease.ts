import { randomUUID } from 'node:crypto';

export type WriteLease = {
  sessionId: string;
  token: string;
  holderId: string;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 60_000;

/**
 * Per-session 写租约（可选诊断 API）。
 * 发送互斥已改为 runtime.isSessionBusy（SESSION_BUSY）；空闲时多端均可 send。
 */
export class SessionWriteLeaseManager {
  private readonly leases = new Map<string, WriteLease>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /** 获取或续租；若他方持有未过期租约则失败 */
  acquire(sessionId: string, holderId: string, token?: string): WriteLease | null {
    this.purgeExpired(sessionId);
    const cur = this.leases.get(sessionId);
    if (cur) {
      if (token && cur.token === token && cur.holderId === holderId) {
        cur.expiresAt = Date.now() + this.ttlMs;
        return cur;
      }
      if (cur.holderId === holderId) {
        cur.expiresAt = Date.now() + this.ttlMs;
        return cur;
      }
      return null;
    }
    const lease: WriteLease = {
      sessionId,
      token: token ?? randomUUID(),
      holderId,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.leases.set(sessionId, lease);
    return lease;
  }

  renew(sessionId: string, token: string): WriteLease | null {
    this.purgeExpired(sessionId);
    const cur = this.leases.get(sessionId);
    if (!cur || cur.token !== token) return null;
    cur.expiresAt = Date.now() + this.ttlMs;
    return cur;
  }

  release(sessionId: string, token: string): boolean {
    const cur = this.leases.get(sessionId);
    if (!cur || cur.token !== token) return false;
    this.leases.delete(sessionId);
    return true;
  }

  /** 无租约或 token 不匹配时返回 false */
  hasWriteAccess(sessionId: string, token: string | undefined | null): boolean {
    this.purgeExpired(sessionId);
    const cur = this.leases.get(sessionId);
    if (!cur) return false;
    return Boolean(token) && cur.token === token;
  }

  get(sessionId: string): WriteLease | null {
    this.purgeExpired(sessionId);
    return this.leases.get(sessionId) ?? null;
  }

  private purgeExpired(sessionId: string): void {
    const cur = this.leases.get(sessionId);
    if (cur && cur.expiresAt <= Date.now()) {
      this.leases.delete(sessionId);
    }
  }
}
