import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { HarnessMode, SessionEvent, SessionHandle, SessionMeta } from '@ciro-code/harness-shared';
import type { ToolResultRecord } from '../compaction/micro-compact.js';
import { ToolResultStore } from '../compaction/tool-result-store.js';
import type { SessionEventLog } from './session-event-log.js';

const CRITICAL_TYPES = new Set(['message', 'tool_result']);

export interface ParsedEventLine {
  event?: SessionEvent;
  /** 损坏或非法关键事件 → 停在此前一致边界 */
  stop?: boolean;
  skipped?: boolean;
}

export interface RecoveredSessionState {
  handle: SessionHandle;
  conversationText: string;
  summarizedText: string;
  toolResults: ToolResultRecord[];
  messageCount: number;
  eventsReplayed: number;
  stoppedAtBoundary: boolean;
  lastEventTs?: number;
  meta?: SessionMeta;
  /** 供 UI 回填聊天列表 */
  messages: RecoveredChatMessage[];
}

export interface RecoveredCompactionMeta {
  method?: string;
  tokensSaved?: number;
  narrative?: string;
}

export interface RecoveredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'compaction';
  content: string;
  /** tool / diff / text / thought 时间线（resume） */
  timeline?: RecoveredTimelineItem[];
  /** turn 耗时（ms），来自 turn_complete */
  workedMs?: number;
  /** 用户消息图片附件（相对 sessionDir） */
  images?: Array<{ path: string; mimeType: string }>;
  /** role=compaction */
  compaction?: RecoveredCompactionMeta;
}

export type RecoveredTimelineItem =
  | RecoveredTimelineTool
  | RecoveredTimelineDiff
  | RecoveredTimelineText
  | RecoveredTimelineThought
  | RecoveredTimelineUser;

/** 忙态 steer/followUp：嵌在助手时间线内，不另开 sticky user 轮 */
export interface RecoveredTimelineUser {
  kind: 'user';
  id: string;
  text: string;
  images?: Array<{ path: string; mimeType: string }>;
}

export interface RecoveredTimelineThought {
  kind: 'thought';
  id: string;
  text: string;
  durationSec?: number;
}

export interface RecoveredTimelineText {
  kind: 'text';
  id: string;
  text: string;
}

export interface RecoveredTimelineTool {
  kind: 'tool';
  id: string;
  toolName: string;
  status: 'done' | 'error';
  preview?: string;
  toolInput?: Record<string, unknown>;
}

export interface RecoveredTimelineDiff {
  kind: 'diff';
  id: string;
  path: string;
  operation: 'write' | 'edit';
  summary: string;
  unifiedDiff: string;
  truncated?: boolean;
  toolCallId?: string;
}

/** 从事件流提取 UI 消息（同 messageId 的 assistant 分段合并；按序交错 text/tool/diff） */
function parseImageRefs(
  raw: unknown,
): Array<{ path: string; mimeType: string }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: Array<{ path: string; mimeType: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const path = (item as { path?: unknown }).path;
    const mimeType = (item as { mimeType?: unknown }).mimeType;
    if (typeof path !== 'string' || !path || typeof mimeType !== 'string' || !mimeType) continue;
    out.push({ path, mimeType });
  }
  return out.length ? out : undefined;
}

function isInFlightDeliverAs(value: unknown): value is 'steer' | 'followUp' {
  return value === 'steer' || value === 'followUp';
}

export function uiMessagesFromEvents(events: SessionEvent[]): RecoveredChatMessage[] {
  const out: RecoveredChatMessage[] = [];
  let pending: RecoveredTimelineItem[] = [];

  const lastAssistant = (): RecoveredChatMessage | undefined => {
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (out[i]!.role === 'assistant') return out[i];
    }
    return undefined;
  };

  const appendPendingTo = (msg: RecoveredChatMessage) => {
    if (pending.length === 0) return;
    msg.timeline = [...(msg.timeline ?? []), ...pending];
    pending = [];
  };

  const flushPendingToLastAssistant = () => {
    if (pending.length === 0) return;
    const last = lastAssistant();
    if (last) {
      appendPendingTo(last);
      return;
    }
    out.push({
      id: `evt-tools-${out.length}`,
      role: 'assistant',
      content: '',
      timeline: [...pending],
    });
    pending = [];
  };

  const ensureAssistant = (id: string): RecoveredChatMessage => {
    const existing = out.find((m) => m.role === 'assistant' && m.id === id);
    if (existing) {
      appendPendingTo(existing);
      return existing;
    }
    const msg: RecoveredChatMessage = {
      id,
      role: 'assistant',
      content: '',
      timeline: pending.length ? [...pending] : undefined,
    };
    pending = [];
    out.push(msg);
    return msg;
  };

  const pushTimelineItem = (item: RecoveredTimelineItem, messageId?: string) => {
    if (typeof messageId === 'string' && messageId) {
      const msg = ensureAssistant(messageId);
      msg.timeline = [...(msg.timeline ?? []), item];
      return;
    }
    const last = lastAssistant();
    if (last) {
      last.timeline = [...(last.timeline ?? []), item];
    } else {
      pending.push(item);
    }
  };

  for (const event of events) {
    if (event.type === 'compaction') {
      flushPendingToLastAssistant();
      const method = typeof event.method === 'string' ? event.method : undefined;
      // micro 过密，时间线不落分隔条（与 live shouldPersistCompactionMarker 对齐）
      if (method === 'micro') continue;
      const tokensSaved =
        typeof event.tokensSaved === 'number' && event.tokensSaved > 0
          ? event.tokensSaved
          : undefined;
      const narrative =
        typeof event.narrative === 'string' && event.narrative.trim()
          ? event.narrative.trim()
          : undefined;
      out.push({
        id: `compaction-${event.ts}-${out.length}`,
        role: 'compaction',
        content: narrative ?? '',
        compaction: { method, tokensSaved, narrative },
      });
      continue;
    }
    if (event.type === 'thinking') {
      const content = typeof event.content === 'string' ? event.content : '';
      if (!content) continue;
      const messageId = typeof event.messageId === 'string' ? event.messageId : undefined;
      const item: RecoveredTimelineThought = {
        kind: 'thought',
        id: `thought-${messageId ?? 'x'}-${event.ts}`,
        text: content,
        durationSec:
          typeof event.durationSec === 'number' && event.durationSec > 0
            ? Math.round(event.durationSec)
            : undefined,
      };
      pushTimelineItem(item, messageId);
      continue;
    }
    if (event.type === 'turn_complete') {
      const messageId = typeof event.messageId === 'string' ? event.messageId : undefined;
      const workedMs =
        typeof event.workedMs === 'number' && event.workedMs >= 0 ? event.workedMs : undefined;
      if (workedMs == null) continue;
      const msg = messageId
        ? ensureAssistant(messageId)
        : lastAssistant() ??
          (() => {
            const m: RecoveredChatMessage = {
              id: `evt-worked-${out.length}`,
              role: 'assistant',
              content: '',
            };
            out.push(m);
            return m;
          })();
      msg.workedMs = workedMs;
      continue;
    }
    if (event.type === 'tool_call') {
      const id = typeof event.toolCallId === 'string' ? event.toolCallId : `tool-${event.ts}`;
      const toolName = typeof event.toolName === 'string' ? event.toolName : 'tool';
      const item: RecoveredTimelineTool = {
        kind: 'tool',
        id,
        toolName,
        status: 'done',
        toolInput:
          event.toolInput && typeof event.toolInput === 'object'
            ? (event.toolInput as Record<string, unknown>)
            : undefined,
      };
      const last = lastAssistant();
      if (last) {
        last.timeline = [...(last.timeline ?? []), item];
      } else {
        pending.push(item);
      }
      continue;
    }
    if (event.type === 'tool_result') {
      const id = typeof event.toolCallId === 'string' ? event.toolCallId : '';
      const isError = Boolean(event.isError);
      const cap = event.toolName === 'AskQuestion' ? 4000 : 300;
      const preview =
        typeof event.content === 'string'
          ? event.content.slice(0, cap)
          : typeof event.resultPreview === 'string'
            ? event.resultPreview.slice(0, cap)
            : undefined;
      const patchTool = (list: RecoveredTimelineItem[]): boolean => {
        const existing = list.find((p) => p.kind === 'tool' && p.id === id);
        if (existing && existing.kind === 'tool') {
          existing.status = isError ? 'error' : 'done';
          if (preview) existing.preview = preview;
          if (typeof event.toolName === 'string') existing.toolName = event.toolName;
          return true;
        }
        return false;
      };
      const last = lastAssistant();
      if (last?.timeline && patchTool(last.timeline)) continue;
      if (patchTool(pending)) continue;
      const item: RecoveredTimelineTool = {
        kind: 'tool',
        id: id || `result-${event.ts}`,
        toolName: typeof event.toolName === 'string' ? event.toolName : 'tool',
        status: isError ? 'error' : 'done',
        preview,
      };
      if (last) {
        last.timeline = [...(last.timeline ?? []), item];
      } else {
        pending.push(item);
      }
      continue;
    }
    if (event.type === 'file_edit') {
      const path = typeof event.path === 'string' ? event.path : 'unknown';
      const operation = event.operation === 'edit' ? 'edit' : 'write';
      const item: RecoveredTimelineDiff = {
        kind: 'diff',
        id: `diff-${typeof event.toolCallId === 'string' ? event.toolCallId : path}-${event.ts}`,
        path,
        operation,
        summary: typeof event.summary === 'string' ? event.summary : path,
        unifiedDiff: typeof event.unifiedDiff === 'string' ? event.unifiedDiff : '',
        truncated: Boolean(event.truncated),
        toolCallId: typeof event.toolCallId === 'string' ? event.toolCallId : undefined,
      };
      const last = lastAssistant();
      if (last) {
        last.timeline = [...(last.timeline ?? []), item];
      } else {
        pending.push(item);
      }
      continue;
    }
    if (event.type !== 'message') continue;
    const role = event.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const content = typeof event.content === 'string' ? event.content : '';
    if (role === 'user') {
      const images = parseImageRefs(event.images);
      if (!content && !images?.length) continue;
      const id =
        typeof event.messageId === 'string' && event.messageId
          ? event.messageId
          : `evt-${event.ts}-${out.length}`;
      /** 仅 JSONL 打标的忙态注入嵌时间线；普通下一轮 user 永不嵌套 */
      if (isInFlightDeliverAs(event.deliverAs)) {
        flushPendingToLastAssistant();
        const host = lastAssistant();
        if (host) {
          const item: RecoveredTimelineUser = {
            kind: 'user',
            id,
            text: content,
            ...(images?.length ? { images } : {}),
          };
          host.timeline = [...(host.timeline ?? []), item];
          continue;
        }
      }
      flushPendingToLastAssistant();
      out.push({ id, role: 'user', content, images });
      continue;
    }
    const id =
      typeof event.messageId === 'string' && event.messageId
        ? event.messageId
        : `evt-${event.ts}-${out.length}`;
    if (!content && pending.length === 0 && !out.some((m) => m.id === id && m.role === 'assistant')) {
      continue;
    }
    const msg = ensureAssistant(id);
    if (content) {
      msg.content = (msg.content ?? '') + content;
      msg.timeline = [
        ...(msg.timeline ?? []),
        { kind: 'text', id: `text-${id}-${event.ts}`, text: content },
      ];
    }
  }
  flushPendingToLastAssistant();
  return out;
}

function enrichTimelinePreviews(
  messages: RecoveredChatMessage[],
  toolResults: ToolResultRecord[],
): RecoveredChatMessage[] {
  if (!toolResults.length) return messages;
  const byId = new Map(toolResults.map((t) => [t.toolCallId, t]));
  return messages.map((m) => {
    if (!m.timeline?.length) return m;
    return {
      ...m,
      timeline: m.timeline.map((item) => {
        if (item.kind !== 'tool' || item.preview) return item;
        const tr = byId.get(item.id);
        if (!tr?.content) return item;
        const cap = tr.toolName === 'AskQuestion' ? 4000 : 300;
        return { ...item, preview: tr.content.slice(0, cap) };
      }),
    };
  });
}

/** 解析单行；关键损坏则 stop */
export function parseEventLine(line: string): ParsedEventLine {
  const trimmed = line.trim();
  if (!trimmed) return { skipped: true };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { stop: true };
  }
  if (!raw || typeof raw !== 'object') return { stop: true };
  const event = raw as SessionEvent;
  if (typeof event.type !== 'string' || typeof event.ts !== 'number') {
    return { stop: true };
  }
  if (CRITICAL_TYPES.has(event.type)) {
    if (event.type === 'message') {
      const role = event.role;
      if (role !== 'user' && role !== 'assistant' && role !== 'system') {
        return { stop: true };
      }
      if (role === 'user' && typeof event.content !== 'string') {
        return { stop: true };
      }
    }
    if (event.type === 'tool_result') {
      if (typeof event.toolCallId !== 'string' || typeof event.toolName !== 'string') {
        return { stop: true };
      }
    }
  }
  return { event };
}

/** disk 条目 → 会计用 content：pointer 仅预览，避免 resume 把外置全文再计入 conversation 桶 */
function accountingContentFromStored(entry: {
  content: string;
  retention?: string;
  preview?: string;
}): string {
  if (entry.retention === 'pointer') return entry.preview ?? '';
  return entry.content || '';
}

/**
 * 重建「仍计入模型上下文」的 tool payload。
 * SM/full 压缩后旧 tool 已不在上下文（可经 get_tool_result 回查磁盘），会计 Map 应清空后只累加压缩之后的结果。
 * micro 将结果降为 preview/pointer，按磁盘 retention 估数。
 */
export function rebuildAccountingToolResults(
  events: SessionEvent[],
  sessionDir: string,
): ToolResultRecord[] {
  const store = existsSync(join(sessionDir, 'tool-results'))
    ? new ToolResultStore(sessionDir)
    : null;
  const byId = new Map<string, ToolResultRecord>();

  const upsert = (toolCallId: string, toolName: string, content: string) => {
    byId.set(toolCallId, { toolCallId, toolName, content });
  };

  for (const event of events) {
    if (event.type === 'compaction') {
      const method = typeof event.method === 'string' ? event.method : '';
      if (method === 'micro') {
        // 外置为 pointer/preview，按磁盘 retention 收缩
        for (const [id, rec] of [...byId.entries()]) {
          const disk = store?.read(id);
          if (disk) {
            upsert(id, rec.toolName, accountingContentFromStored(disk));
          }
        }
      } else {
        // session-memory / full / 旧事件无 method：旧 tool 已不在模型上下文
        byId.clear();
      }
      continue;
    }
    if (event.type !== 'tool_result') continue;
    const id = String(event.toolCallId);
    const name = String(event.toolName);
    const disk = store?.read(id);
    if (disk) {
      upsert(id, name, accountingContentFromStored(disk));
    } else {
      upsert(id, name, typeof event.content === 'string' ? event.content : '');
    }
  }

  return [...byId.values()];
}

/** UI 时间线预览：可含压缩前工具（get_tool_result 同源磁盘） */
export function loadAllToolResultsForUi(sessionDir: string): ToolResultRecord[] {
  if (!existsSync(join(sessionDir, 'tool-results'))) return [];
  return new ToolResultStore(sessionDir).list().map((e) => ({
    toolCallId: e.toolCallId,
    toolName: e.toolName,
    content: accountingContentFromStored(e),
  }));
}

export function replayEvents(events: SessionEvent[]): {
  mode: HarnessMode;
  workspace: string;
  createdAt: number;
  conversationText: string;
  summarizedText: string;
  messageCount: number;
  eventsReplayed: number;
  stoppedAtBoundary: boolean;
  lastEventTs?: number;
} {
  let mode: HarnessMode = 'ask';
  let workspace = '';
  let createdAt = Date.now();
  let conversationText = '';
  let summarizedText = '';
  let messageCount = 0;
  let lastEventTs: number | undefined;

  for (const event of events) {
    lastEventTs = event.ts;
    switch (event.type) {
      case 'session_start': {
        if (typeof event.workspace === 'string') workspace = event.workspace;
        if (typeof event.mode === 'string') mode = event.mode as HarnessMode;
        createdAt = event.ts;
        break;
      }
      case 'mode_change': {
        if (typeof event.mode === 'string') mode = event.mode as HarnessMode;
        break;
      }
      case 'message': {
        const role = event.role as string;
        if (role === 'user' || role === 'assistant') {
          messageCount += 1;
          const content = typeof event.content === 'string' ? event.content : '';
          if (role === 'user' && content) {
            conversationText += `\nUser: ${content}`;
          } else if (role === 'assistant' && content) {
            conversationText += `\nAssistant: ${content}`;
          }
        }
        break;
      }
      case 'compaction': {
        if (typeof event.summarized === 'string') {
          summarizedText = event.summarized;
        }
        if (typeof event.conversation === 'string') {
          conversationText = event.conversation;
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    mode,
    workspace,
    createdAt,
    conversationText,
    summarizedText,
    messageCount,
    eventsReplayed: events.length,
    stoppedAtBoundary: false,
    lastEventTs,
  };
}

export class SessionRecoveryManager {
  constructor(private readonly eventLog: SessionEventLog) {}

  listPersistedIds(): string[] {
    const root = this.eventLog.sessionsRoot;
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((id) => existsSync(this.eventLog.metaPath(id)));
  }

  listPersistedMeta(): SessionMeta[] {
    const out: SessionMeta[] = [];
    for (const id of this.listPersistedIds()) {
      const meta = this.eventLog.readMeta(id);
      if (meta) out.push(meta);
    }
    return out;
  }

  /** 删除从未发过消息的会话目录，返回被删 id */
  purgeEmpty(): string[] {
    const removed: string[] = [];
    for (const meta of this.listPersistedMeta()) {
      if ((meta.currentState.messageCount ?? 0) > 0) continue;
      if (this.eventLog.removeSession(meta.sessionId)) {
        removed.push(meta.sessionId);
      }
    }
    return removed;
  }

  /**
   * 从 events.jsonl 回放。关键事件损坏则停在最近一致边界。
   * tool-results/ 目录补充外置结果。
   */
  recover(sessionId: string): RecoveredSessionState | undefined {
    const meta = this.eventLog.readMeta(sessionId);
    const path = this.eventLog.eventsPath(sessionId);
    if (!meta && !existsSync(path)) return undefined;

    const { events, stoppedAtBoundary } = this.readEventsUntilBoundary(sessionId);
    if (events.length === 0 && !meta) return undefined;

    const replayed = replayEvents(events);
    const workspace = replayed.workspace || meta?.workspace || '';
    const mode = replayed.mode || meta?.currentState.mode || 'ask';
    const createdAt = meta?.currentState.createdAt ?? replayed.createdAt;

    const handle: SessionHandle = {
      id: sessionId,
      workspace,
      mode,
      createdAt,
      modelRef: meta?.currentState.modelRef,
      title: meta?.currentState.title,
      thinkingLevel: meta?.currentState.thinkingLevel,
      maxMode: meta?.currentState.maxMode,
    };

    const sessionDir = this.eventLog.sessionDir(sessionId);
    const toolResults = rebuildAccountingToolResults(events, sessionDir);
    const uiTools = loadAllToolResultsForUi(sessionDir);
    // 事件里有、磁盘没有的补进 UI 预览
    for (const event of events) {
      if (event.type !== 'tool_result') continue;
      const id = String(event.toolCallId);
      if (uiTools.some((t) => t.toolCallId === id)) continue;
      uiTools.push({
        toolCallId: id,
        toolName: String(event.toolName),
        content: typeof event.content === 'string' ? event.content : '',
      });
    }

    const messages = enrichTimelinePreviews(uiMessagesFromEvents(events), uiTools);

    return {
      handle,
      conversationText: replayed.conversationText,
      summarizedText: replayed.summarizedText,
      toolResults,
      messageCount: replayed.messageCount || meta?.currentState.messageCount || 0,
      eventsReplayed: replayed.eventsReplayed,
      stoppedAtBoundary,
      lastEventTs: replayed.lastEventTs,
      meta: meta ?? undefined,
      messages,
    };
  }

  readEventsUntilBoundary(sessionId: string): {
    events: SessionEvent[];
    stoppedAtBoundary: boolean;
  } {
    const path = this.eventLog.eventsPath(sessionId);
    if (!existsSync(path)) return { events: [], stoppedAtBoundary: false };

    const text = readFileSync(path, 'utf-8');
    const events: SessionEvent[] = [];
    let stoppedAtBoundary = false;
    for (const line of text.split('\n')) {
      const parsed = parseEventLine(line);
      if (parsed.skipped) continue;
      if (parsed.stop) {
        stoppedAtBoundary = true;
        break;
      }
      if (parsed.event) events.push(parsed.event);
    }
    return { events, stoppedAtBoundary };
  }
}
