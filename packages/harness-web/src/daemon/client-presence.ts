/**
 * Detached daemon 客户端在线表（lease / presence）。
 *
 * 对齐本地 agent CLI 常见做法（心跳租约 + 显式 goodbye）：
 * - touch：续租；leave：主动注销
 * - 超时未续租 → 视为崩溃/终端强杀，sweep 回收
 * - 无客户端 → grace 后 onEmpty（停后端）
 *
 * 仅当 CIRO_DAEMON_AUTO_STOP=1 时启用。
 */
export class DaemonClientPresence {
  private readonly clients = new Map<string, number>();
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly graceMs: number;
  private readonly staleMs: number;
  private readonly onEmpty: () => void;
  private readonly now: () => number;
  private enabled: boolean;

  constructor(opts: {
    graceMs?: number;
    /** 未 touch 超过此时长视为失联（默认 30s ≈ 3 次 10s 心跳） */
    staleMs?: number;
    sweepMs?: number;
    enabled?: boolean;
    onEmpty: () => void;
    /** 测试注入时钟 */
    now?: () => number;
  }) {
    // 略长于刷新 leave→touch 空窗；同 id 续租会 cancelShutdown
    this.graceMs = opts.graceMs ?? 3_000;
    this.staleMs = opts.staleMs ?? 30_000;
    this.enabled = opts.enabled !== false;
    this.onEmpty = opts.onEmpty;
    this.now = opts.now ?? Date.now;
    if (this.enabled) {
      const sweepMs = opts.sweepMs ?? 5_000;
      this.sweepTimer = setInterval(() => this.sweepStale(), sweepMs);
      this.sweepTimer.unref?.();
    }
  }

  get size(): number {
    return this.clients.size;
  }

  touch(clientId: string): void {
    if (!this.enabled || !clientId.trim()) return;
    this.clients.set(clientId.trim(), this.now());
    this.cancelShutdown();
  }

  leave(clientId: string): void {
    if (!this.enabled || !clientId.trim()) return;
    this.clients.delete(clientId.trim());
    this.scheduleIfEmpty();
  }

  /** 按前缀批量注销（如 dev:web 退出时收口残留的 web-* 浏览器租约） */
  leaveByPrefix(prefix: string): number {
    if (!this.enabled || !prefix) return 0;
    let removed = 0;
    for (const id of [...this.clients.keys()]) {
      if (!id.startsWith(prefix)) continue;
      this.clients.delete(id);
      removed += 1;
    }
    if (removed > 0) this.scheduleIfEmpty();
    return removed;
  }

  /** 启动宽限期：避免 spawn 后、首个客户端登记前误杀 */
  holdBootstrap(ms: number): void {
    if (!this.enabled) return;
    this.cancelShutdown();
    this.shutdownTimer = setTimeout(() => {
      this.shutdownTimer = null;
      this.scheduleIfEmpty();
    }, ms);
    this.shutdownTimer.unref?.();
  }

  /** 进程退出前停掉 sweep，避免挂起事件循环 */
  dispose(): void {
    this.enabled = false;
    this.cancelShutdown();
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.clients.clear();
  }

  /** @internal 测试 / 主动触发 */
  sweepStale(): void {
    if (!this.enabled) return;
    const cutoff = this.now() - this.staleMs;
    let removed = false;
    for (const [id, seen] of this.clients) {
      if (seen < cutoff) {
        this.clients.delete(id);
        removed = true;
      }
    }
    if (removed) this.scheduleIfEmpty();
  }

  private scheduleIfEmpty(): void {
    if (!this.enabled || this.clients.size > 0) return;
    this.cancelShutdown();
    this.shutdownTimer = setTimeout(() => {
      this.shutdownTimer = null;
      if (this.enabled && this.clients.size === 0) this.onEmpty();
    }, this.graceMs);
    this.shutdownTimer.unref?.();
  }

  private cancelShutdown(): void {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }
  }
}
