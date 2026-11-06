/** 流式 token/thinking 的 rAF 合批（O1）。同 session+assistant 合并连续同类型 delta。 */

export type StreamDeltaKind = 'token' | 'thinking';

export interface StreamDeltaPart {
  kind: StreamDeltaKind;
  text: string;
}

export interface StreamDeltaFlush {
  sessionId: string;
  assistantId: string;
  parts: StreamDeltaPart[];
}

export type StreamDeltaFlushHandler = (flush: StreamDeltaFlush) => void;

export interface StreamDeltaBatcherOptions {
  /** 默认 requestAnimationFrame；单测可注入同步/可控调度 */
  schedule?: (cb: () => void) => number;
  cancel?: (handle: number) => void;
}

interface SessionAssistantBuf {
  sessionId: string;
  assistantId: string;
  parts: StreamDeltaPart[];
}

function bufKey(sessionId: string, assistantId: string): string {
  return `${sessionId}\0${assistantId}`;
}

function defaultSchedule(cb: () => void): number {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(cb);
  }
  return globalThis.setTimeout(cb, 0) as unknown as number;
}

function defaultCancel(handle: number): void {
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(handle);
    return;
  }
  globalThis.clearTimeout(handle);
}

export interface StreamDeltaBatcher {
  enqueue(
    sessionId: string,
    assistantId: string,
    kind: StreamDeltaKind,
    delta: string,
  ): void;
  /** 同步刷出指定 session 的全部缓冲（terminal / 结构事件前） */
  flushSession(sessionId: string): void;
  flushAll(): void;
  /** 丢弃指定 session 缓冲并取消其待执行帧（turnEpoch / abort） */
  discardSession(sessionId: string): void;
  discardAll(): void;
}

export function createStreamDeltaBatcher(
  onFlush: StreamDeltaFlushHandler,
  opts?: StreamDeltaBatcherOptions,
): StreamDeltaBatcher {
  const schedule = opts?.schedule ?? defaultSchedule;
  const cancel = opts?.cancel ?? defaultCancel;
  const buffers = new Map<string, SessionAssistantBuf>();
  let rafHandle: number | null = null;

  function takeKeys(predicate: (buf: SessionAssistantBuf) => boolean): StreamDeltaFlush[] {
    const out: StreamDeltaFlush[] = [];
    for (const [k, buf] of buffers) {
      if (!predicate(buf)) continue;
      buffers.delete(k);
      if (buf.parts.length) {
        out.push({
          sessionId: buf.sessionId,
          assistantId: buf.assistantId,
          parts: buf.parts,
        });
      }
    }
    return out;
  }

  function emit(flushes: StreamDeltaFlush[]): void {
    for (const f of flushes) onFlush(f);
  }

  function cancelRaf(): void {
    if (rafHandle == null) return;
    cancel(rafHandle);
    rafHandle = null;
  }

  function scheduleFlush(): void {
    if (rafHandle != null) return;
    rafHandle = schedule(() => {
      rafHandle = null;
      emit(takeKeys(() => true));
    });
  }

  return {
    enqueue(sessionId, assistantId, kind, delta) {
      if (!delta) return;
      const k = bufKey(sessionId, assistantId);
      let buf = buffers.get(k);
      if (!buf) {
        buf = { sessionId, assistantId, parts: [] };
        buffers.set(k, buf);
      }
      const last = buf.parts[buf.parts.length - 1];
      if (last && last.kind === kind) {
        last.text += delta;
      } else {
        buf.parts.push({ kind, text: delta });
      }
      scheduleFlush();
    },

    flushSession(sessionId) {
      cancelRaf();
      // 可能仍有其它 session 在缓冲：若有则重新 schedule
      const mine = takeKeys((b) => b.sessionId === sessionId);
      emit(mine);
      if (buffers.size > 0) scheduleFlush();
    },

    flushAll() {
      cancelRaf();
      emit(takeKeys(() => true));
    },

    discardSession(sessionId) {
      for (const [k, buf] of [...buffers.entries()]) {
        if (buf.sessionId === sessionId) buffers.delete(k);
      }
      if (buffers.size === 0) cancelRaf();
    },

    discardAll() {
      buffers.clear();
      cancelRaf();
    },
  };
}
