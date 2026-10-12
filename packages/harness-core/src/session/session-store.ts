import { randomUUID } from 'node:crypto';
import type {
  HarnessMode,
  ModelRef,
  SessionCreateOptions,
  SessionHandle,
  ThinkingLevel,
} from '@ciro-code/harness-shared';
import {
  SessionEventLog,
  defaultSessionsRoot,
  type SessionEventLogOptions,
} from './session-event-log.js';
import { SessionRecoveryManager } from './session-recovery.js';

function sameModelRef(a?: ModelRef, b?: ModelRef): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.providerId === b.providerId && a.modelId === b.modelId;
}

export interface SessionStoreOptions extends SessionEventLogOptions {
  /** 默认 true：落盘 events.jsonl + meta.json */
  persist?: boolean;
}

export class SessionStore {
  private sessions = new Map<string, SessionHandle>();
  readonly eventLog: SessionEventLog | null;
  readonly persist: boolean;

  constructor(opts: SessionStoreOptions = {}) {
    this.persist = opts.persist ?? true;
    this.eventLog = this.persist
      ? new SessionEventLog({
          sessionsRoot: opts.sessionsRoot ?? defaultSessionsRoot(),
          snapshotInterval: opts.snapshotInterval,
        })
      : null;
  }

  create(opts: SessionCreateOptions): SessionHandle {
    const handle: SessionHandle = {
      id: opts.sessionId ?? randomUUID(),
      workspace: opts.workspace,
      mode: opts.mode ?? 'ask',
      createdAt: Date.now(),
      modelRef: opts.modelRef,
    };
    this.sessions.set(handle.id, handle);
    this.eventLog?.ensureSession(
      handle.id,
      handle.workspace,
      handle.mode,
      handle.createdAt,
      handle.modelRef,
    );
    return handle;
  }

  get(id: string): SessionHandle | undefined {
    return this.sessions.get(id);
  }

  list(): SessionHandle[] {
    return [...this.sessions.values()];
  }

  updateMode(id: string, mode: HarnessMode): SessionHandle | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const previousMode = session.mode;
    const updated = { ...session, mode };
    this.sessions.set(id, updated);
    if (previousMode !== mode) {
      this.eventLog?.append(id, {
        type: 'mode_change',
        mode,
        previousMode,
      });
    }
    return updated;
  }

  updateModelRef(id: string, modelRef: ModelRef | undefined): SessionHandle | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const previousModelRef = session.modelRef;
    const updated: SessionHandle = { ...session, modelRef };
    this.sessions.set(id, updated);
    if (!sameModelRef(previousModelRef, modelRef)) {
      this.eventLog?.append(id, {
        type: 'model_change',
        modelRef: modelRef ?? null,
        previousModelRef: previousModelRef ?? null,
      });
    }
    return updated;
  }

  updateThinkingLevel(
    id: string,
    thinkingLevel: ThinkingLevel | undefined,
  ): SessionHandle | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const updated: SessionHandle = { ...session, thinkingLevel };
    this.sessions.set(id, updated);
    this.eventLog?.updateThinkingLevel(id, thinkingLevel);
    return updated;
  }

  updateMaxMode(id: string, maxMode: boolean): SessionHandle | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const updated: SessionHandle = { ...session };
    if (maxMode) updated.maxMode = true;
    else delete updated.maxMode;
    this.sessions.set(id, updated);
    this.eventLog?.updateMaxMode(id, maxMode);
    return updated;
  }

  updateTitle(id: string, title: string | undefined): SessionHandle | undefined {
    const nextTitle = title?.trim() ? title.trim() : undefined;
    let session = this.sessions.get(id);
    if (!session && this.eventLog) {
      const meta = this.eventLog.readMeta(id);
      if (meta) {
        session = {
          id,
          workspace: meta.workspace,
          mode: meta.currentState.mode,
          createdAt: meta.currentState.createdAt,
          modelRef: meta.currentState.modelRef,
          title: meta.currentState.title,
          thinkingLevel: meta.currentState.thinkingLevel,
          maxMode: meta.currentState.maxMode,
        };
        this.adopt(session);
      }
    }
    if (!session) return undefined;
    const updated: SessionHandle = { ...session, title: nextTitle };
    this.sessions.set(id, updated);
    this.eventLog?.updateTitle(id, nextTitle);
    return updated;
  }

  /**
   * 硬截断到指定 user message 之前；会话须已在内存或磁盘。
   * 截断后调用方应 append rewind/fork 边界事件并重建 runtime。
   */
  truncateBeforeUserMessage(
    id: string,
    messageId: string,
  ): { kept: number; discarded: number } {
    if (!this.eventLog) {
      throw new Error('SessionStore persist is disabled');
    }
    return this.eventLog.truncateBeforeUserMessage(id, messageId);
  }

  /** C4e：克隆 src 至 through（含）到 dest；dest 须已在 store / ensureSession */
  cloneThroughMessage(
    srcId: string,
    destId: string,
    throughMessageId: string,
  ): { cloned: number } {
    if (!this.eventLog) {
      throw new Error('SessionStore persist is disabled');
    }
    return this.eventLog.cloneThroughMessage(srcId, destId, throughMessageId);
  }

  appendEvent(
    id: string,
    event: Parameters<SessionEventLog['append']>[1],
  ): void {
    if (!this.sessions.has(id)) return;
    this.eventLog?.append(id, event);
  }

  /** 将已有会话挂回内存（不写 session_start；用于 resume） */
  adopt(handle: SessionHandle): SessionHandle {
    this.sessions.set(handle.id, handle);
    return handle;
  }

  /** 仅移出内存索引，保留磁盘 events.jsonl（模拟进程重启） */
  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  /** 移出内存并删除磁盘目录 */
  purge(id: string): boolean {
    this.sessions.delete(id);
    return this.eventLog?.removeSession(id) ?? false;
  }

  /** 删除无消息会话（磁盘 + 内存） */
  purgeEmpty(): string[] {
    if (!this.eventLog) return [];
    const removed = new SessionRecoveryManager(this.eventLog).purgeEmpty();
    for (const id of removed) this.sessions.delete(id);
    return removed;
  }
}
