import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  HarnessMode,
  ModelRef,
  SessionEvent,
  SessionEventType,
  SessionMeta,
  ThinkingLevel,
} from '@ciro/harness-shared';
import {
  legacyPathWarning,
  legacySessionsRoot,
  resolveReadableDir,
  sessionsRoot,
} from '../paths/product-paths.js';

/** 新写根目录 `~/.ciro/sessions`；若仅有旧数据则构造时落到 legacy */
export function defaultSessionsRoot(): string {
  const resolved = resolveReadableDir(sessionsRoot(), legacySessionsRoot());
  if (resolved.fromLegacy) {
    console.warn(`[ciro] ${legacyPathWarning('sessions', legacySessionsRoot())}`);
  }
  return resolved.path;
}

export interface SessionEventLogOptions {
  sessionsRoot?: string;
  snapshotInterval?: number;
}

export class SessionEventLog {
  readonly sessionsRoot: string;
  readonly snapshotInterval: number;

  constructor(opts: SessionEventLogOptions = {}) {
    this.sessionsRoot = opts.sessionsRoot ?? defaultSessionsRoot();
    this.snapshotInterval = opts.snapshotInterval ?? 500;
    mkdirSync(this.sessionsRoot, { recursive: true });
  }

  sessionDir(sessionId: string): string {
    return join(this.sessionsRoot, sessionId);
  }

  eventsPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), 'events.jsonl');
  }

  metaPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), 'meta.json');
  }

  ensureSession(
    sessionId: string,
    workspace: string,
    mode: HarnessMode,
    createdAt: number,
    modelRef?: ModelRef,
  ): SessionMeta {
    const dir = this.sessionDir(sessionId);
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, 'tool-results'), { recursive: true });

    if (!existsSync(this.metaPath(sessionId))) {
      const meta: SessionMeta = {
        sessionId,
        workspace,
        lastEventOffset: 0,
        snapshotPoints: [],
        currentState: {
          mode,
          messageCount: 0,
          tokenEstimate: 0,
          createdAt,
          modelRef,
        },
      };
      this.writeMeta(meta);
      this.append(sessionId, {
        type: 'session_start',
        ts: createdAt,
        workspace,
        mode,
        modelRef: modelRef ?? null,
      });
      return this.readMeta(sessionId)!;
    }
    return this.readMeta(sessionId)!;
  }

  /** 删除会话目录（磁盘） */
  removeSession(sessionId: string): boolean {
    const dir = this.sessionDir(sessionId);
    if (!existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  }

  append(sessionId: string, event: Omit<SessionEvent, 'ts'> & { ts?: number }): void {
    const dir = this.sessionDir(sessionId);
    mkdirSync(dir, { recursive: true });
    const full: SessionEvent = {
      ...event,
      type: event.type as SessionEventType,
      ts: event.ts ?? Date.now(),
    };
    const line = JSON.stringify(full) + '\n';
    appendFileSync(this.eventsPath(sessionId), line, 'utf-8');

    const meta = this.readMeta(sessionId) ?? {
      sessionId,
      workspace: '',
      lastEventOffset: 0,
      snapshotPoints: [],
      currentState: {
        mode: 'ask' as HarnessMode,
        messageCount: 0,
        tokenEstimate: 0,
        createdAt: full.ts,
      },
    };

    const prevOffset = meta.lastEventOffset;
    meta.lastEventOffset = prevOffset + Buffer.byteLength(line, 'utf-8');

    if (full.type === 'message') {
      meta.currentState.messageCount += 1;
    }
    if (full.type === 'mode_change' && typeof full.mode === 'string') {
      meta.currentState.mode = full.mode as HarnessMode;
      const ptr = debugPointerFromModeChange(full);
      if (ptr) meta.currentState.debug = ptr;
    }
    if (full.type === 'model_change') {
      const ref = full.modelRef;
      if (ref && typeof ref === 'object' && 'providerId' in (ref as object)) {
        meta.currentState.modelRef = ref as ModelRef;
      } else {
        delete meta.currentState.modelRef;
      }
    }
    if (
      (full.type === 'plan_created' ||
        full.type === 'plan_updated' ||
        full.type === 'plan_confirmed') &&
      typeof full.planId === 'string'
    ) {
      meta.currentState.activePlanId = full.planId as string;
      if (full.type === 'plan_confirmed') {
        meta.currentState.confirmedPlanId = full.planId as string;
      }
    }
    if (typeof full.tokenEstimate === 'number') {
      meta.currentState.tokenEstimate = full.tokenEstimate as number;
    }

    const eventCount = this.countEvents(sessionId);
    if (
      eventCount > 0 &&
      eventCount % this.snapshotInterval === 0 &&
      !meta.snapshotPoints.includes(meta.lastEventOffset)
    ) {
      meta.snapshotPoints.push(meta.lastEventOffset);
    }

    this.writeMeta(meta);
  }

  readEvents(sessionId: string): SessionEvent[] {
    const path = this.eventsPath(sessionId);
    if (!existsSync(path)) return [];
    const text = readFileSync(path, 'utf-8');
    const events: SessionEvent[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as SessionEvent);
      } catch {
        // 损坏行跳过（Sprint 1 骨架；Sprint 3 recovery 细化）
      }
    }
    return events;
  }

  readMeta(sessionId: string): SessionMeta | undefined {
    const path = this.metaPath(sessionId);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as SessionMeta;
    } catch {
      return undefined;
    }
  }

  /** meta.debug，否则从最近一条带指针的 mode_change 回放（兼容写入前的会话） */
  lastDebugPointer(sessionId: string): SessionMeta['currentState']['debug'] | undefined {
    const fromMeta = this.readMeta(sessionId)?.currentState.debug;
    if (fromMeta?.debugSessionId && fromMeta.logPathRel) return fromMeta;
    const events = this.readEvents(sessionId);
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ptr = debugPointerFromModeChange(events[i]!);
      if (ptr) return ptr;
    }
    return undefined;
  }

  /**
   * 硬截断：保留目标 user message **之前**的全部事件（丢弃该轮及之后）。
   * 找不到 messageId 时抛错。
   */
  truncateBeforeUserMessage(
    sessionId: string,
    messageId: string,
  ): { kept: number; discarded: number } {
    const lines = this.readEventLines(sessionId);
    let cutIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      try {
        const event = JSON.parse(lines[i]!) as SessionEvent;
        if (
          event.type === 'message' &&
          event.role === 'user' &&
          event.messageId === messageId
        ) {
          cutIndex = i;
          break;
        }
      } catch {
        // skip corrupt
      }
    }
    if (cutIndex < 0) {
      throw new Error(`User message not found: ${messageId}`);
    }

    const keptLines = lines.slice(0, cutIndex);
    const discarded = lines.length - keptLines.length;
    this.writeEventLines(sessionId, keptLines);
    this.recomputeMetaFromLines(sessionId, keptLines);
    return { kept: keptLines.length, discarded };
  }

  /**
   * C4e：将 src 事件克隆到 dest（含 throughMessageId 对应 message 行，user/assistant 均可）。
   * 覆盖 dest 的 events.jsonl；不修改 src。dest 须已 ensureSession。
   */
  cloneThroughMessage(
    srcId: string,
    destId: string,
    throughMessageId: string,
  ): { cloned: number } {
    if (!existsSync(this.metaPath(destId))) {
      throw new Error(`Session not found: ${destId}`);
    }
    const lines = this.readEventLines(srcId);
    let cutIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      try {
        const event = JSON.parse(lines[i]!) as SessionEvent;
        if (event.type === 'message' && event.messageId === throughMessageId) {
          cutIndex = i;
          break;
        }
      } catch {
        // skip corrupt
      }
    }
    if (cutIndex < 0) {
      throw new Error(`Message not found: ${throughMessageId}`);
    }

    const clonedLines = lines.slice(0, cutIndex + 1);
    this.writeEventLines(destId, clonedLines);
    this.recomputeMetaFromLines(destId, clonedLines);
    return { cloned: clonedLines.length };
  }

  private readEventLines(sessionId: string): string[] {
    const path = this.eventsPath(sessionId);
    if (!existsSync(path)) {
      throw new Error(`Session events not found: ${sessionId}`);
    }
    const text = readFileSync(path, 'utf-8');
    const lines: string[] = [];
    for (const line of text.split('\n')) {
      if (line.trim()) lines.push(line.endsWith('\n') ? line.replace(/\n$/, '') : line);
    }
    return lines;
  }

  private writeEventLines(sessionId: string, lines: string[]): void {
    const path = this.eventsPath(sessionId);
    const body = lines.length > 0 ? lines.join('\n') + '\n' : '';
    writeFileSync(path, body, 'utf-8');
  }

  private recomputeMetaFromLines(sessionId: string, lines: string[]): void {
    const meta = this.readMeta(sessionId);
    if (!meta) return;
    let messageCount = 0;
    let offset = 0;
    const recomputedSnapshots: number[] = [];
    let count = 0;
    let debug: SessionMeta['currentState']['debug'];
    for (const line of lines) {
      offset += Buffer.byteLength(line + '\n', 'utf-8');
      count += 1;
      try {
        const event = JSON.parse(line) as SessionEvent;
        if (event.type === 'message') messageCount += 1;
        const ptr = debugPointerFromModeChange(event);
        if (ptr) debug = ptr;
      } catch {
        // skip
      }
      if (count % this.snapshotInterval === 0) {
        recomputedSnapshots.push(offset);
      }
    }
    meta.lastEventOffset = offset;
    meta.snapshotPoints = recomputedSnapshots;
    meta.currentState.messageCount = messageCount;
    if (debug) meta.currentState.debug = debug;
    else delete meta.currentState.debug;
    this.writeMeta(meta);
  }

  /** 仅更新 meta.currentState.title（不写 events） */
  updateTitle(sessionId: string, title: string | undefined): void {
    const meta = this.readMeta(sessionId);
    if (!meta) return;
    if (title === undefined || title === '') {
      delete meta.currentState.title;
    } else {
      meta.currentState.title = title;
    }
    this.writeMeta(meta);
  }

  updateThinkingLevel(sessionId: string, thinkingLevel: ThinkingLevel | undefined): void {
    const meta = this.readMeta(sessionId);
    if (!meta) return;
    if (thinkingLevel === undefined) {
      delete meta.currentState.thinkingLevel;
    } else {
      meta.currentState.thinkingLevel = thinkingLevel;
    }
    this.writeMeta(meta);
  }

  updateMaxMode(sessionId: string, maxMode: boolean): void {
    const meta = this.readMeta(sessionId);
    if (!meta) return;
    if (maxMode) meta.currentState.maxMode = true;
    else delete meta.currentState.maxMode;
    this.writeMeta(meta);
  }

  private writeMeta(meta: SessionMeta): void {
    writeFileSync(this.metaPath(meta.sessionId), JSON.stringify(meta, null, 2), 'utf-8');
  }

  private countEvents(sessionId: string): number {
    const path = this.eventsPath(sessionId);
    if (!existsSync(path)) return 0;
    const text = readFileSync(path, 'utf-8');
    return text.split('\n').filter((l) => l.trim()).length;
  }
}

function debugPointerFromModeChange(
  event: SessionEvent,
): SessionMeta['currentState']['debug'] | undefined {
  if (event.type !== 'mode_change') return undefined;
  const debugSessionId = event.debugSessionId;
  const logPathRel = event.logPathRel;
  if (typeof debugSessionId !== 'string' || !debugSessionId.trim()) return undefined;
  if (typeof logPathRel !== 'string' || !logPathRel.trim()) return undefined;
  return { debugSessionId, logPathRel, status: 'ready' };
}
