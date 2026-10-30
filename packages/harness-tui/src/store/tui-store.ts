import type {
  ContextUsageSnapshot,
  HarnessMode,
  ModelRef,
  SseEnvelope,
} from '@ciro-code/harness-shared';
import {
  createStreamDeltaBatcher,
  noteEventSeq,
  reduceEvent,
  upsertTextDelta,
  upsertThoughtDelta,
  type ChatMessage,
  type PermissionRequestState,
  type ReduceEffect,
  type StreamDeltaBatcher,
  type TranslateFn,
} from '@ciro-code/harness-timeline';

export type TuiStatus = 'idle' | 'streaming' | 'error';

export interface TuiChatSlice {
  sessionId: string | null;
  messages: ChatMessage[];
  mode: HarnessMode;
  modelRef: ModelRef | null;
  status: TuiStatus;
  turnEpoch: number;
  activeAssistantId: string | null;
  lastSeq: number | null;
  turnStartedAt: number | null;
  /** 上一轮完成耗时（秒），供时间线尾 Worked for */
  lastTurnWorkedSec: number | null;
  contextUsage: ContextUsageSnapshot | null;
  permissions: PermissionRequestState[];
  /** 兼容布局：取队列首条 */
  permission: PermissionRequestState | null;
  input: string;
  error: string | null;
  /** slash / @ 下拉骨架可见性 */
  autocomplete: 'slash' | 'mention' | null;
  /** 展开的 timeline item id（thought / tool） */
  expandedIds: ReadonlySet<string>;
}

export type TuiStoreListener = (slice: TuiChatSlice) => void;

export interface TuiStore {
  get(): TuiChatSlice;
  subscribe(fn: TuiStoreListener): () => void;
  setInput(text: string): void;
  setMode(mode: HarnessMode): void;
  setModelRef(ref: ModelRef | null): void;
  setSessionId(id: string | null): void;
  setAutocomplete(kind: 'slash' | 'mention' | null): void;
  toggleExpanded(id: string): void;
  beginTurn(assistantId: string): void;
  applyEvent(event: SseEnvelope): 'continue' | 'break';
  endTurn(stopped?: boolean): void;
  patch(partial: Partial<TuiChatSlice>): void;
}

function emptySlice(mode: HarnessMode): TuiChatSlice {
  return {
    sessionId: null,
    messages: [],
    mode,
    modelRef: null,
    status: 'idle',
    turnEpoch: 0,
    activeAssistantId: null,
    lastSeq: null,
    turnStartedAt: null,
    lastTurnWorkedSec: null,
    contextUsage: null,
    permissions: [],
    permission: null,
    input: '',
    error: null,
    autocomplete: null,
    expandedIds: new Set(),
  };
}

export function createTuiStore(opts: {
  mode?: HarnessMode;
  t?: TranslateFn;
}): TuiStore {
  let slice = emptySlice(opts.mode ?? 'agent');
  const listeners = new Set<TuiStoreListener>();
  const t: TranslateFn = opts.t ?? ((k) => k);
  const seqRefs = { lastSeq: null as number | null };

  const notify = () => {
    for (const fn of listeners) fn(slice);
  };

  const set = (next: TuiChatSlice) => {
    slice = next;
    seqRefs.lastSeq = next.lastSeq;
    notify();
  };

  const batcher: StreamDeltaBatcher = createStreamDeltaBatcher(
    (flush) => {
      let msgs = slice.messages;
      const { assistantId, parts } = flush;
      for (const part of parts) {
        if (part.kind === 'thinking') {
          msgs = upsertThoughtDelta(msgs, assistantId, part.text);
        } else {
          msgs = upsertTextDelta(msgs, assistantId, part.text);
        }
      }
      set({ ...slice, messages: msgs });
    },
    {
      schedule: (cb) => setTimeout(cb, 16) as unknown as number,
      cancel: (h) => clearTimeout(h),
    },
  );

  const applyEffects = (effects: ReduceEffect[]) => {
    for (const e of effects) {
      if (e.type === 'setMode') slice = { ...slice, mode: e.mode };
      else if (e.type === 'setModelRef') slice = { ...slice, modelRef: e.modelRef };
      else if (e.type === 'setError') slice = { ...slice, error: e.message, status: 'error' };
      else if (e.type === 'setPlanQuestions') {
        // T-1：提问走 overlay 后续；先忽略
      } else if (e.type === 'sideEvent') {
        // plan/debug 侧栏 T-2；T-1 仅保证归约不丢
      } else if (e.type === 'toast') {
        // 无 toast UI；写入 error 区可选
      }
    }
  };

  return {
    get: () => slice,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setInput(text) {
      set({ ...slice, input: text });
    },
    setMode(mode) {
      set({ ...slice, mode });
    },
    setModelRef(ref) {
      set({ ...slice, modelRef: ref });
    },
    setSessionId(id) {
      set({ ...slice, sessionId: id });
    },
    setAutocomplete(kind) {
      set({ ...slice, autocomplete: kind });
    },
    toggleExpanded(id) {
      const next = new Set(slice.expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set({ ...slice, expandedIds: next });
    },
    beginTurn(assistantId) {
      const userContent = slice.input;
      const modelLabel = slice.modelRef?.modelId;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userContent,
        status: 'completed',
      };
      const assistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        timeline: [],
        streamStartedAt: Date.now(),
        turnMode: slice.mode,
        turnModelLabel: modelLabel,
      };
      set({
        ...slice,
        input: '',
        autocomplete: null,
        messages: [...slice.messages, userMsg, assistant],
        status: 'streaming',
        turnEpoch: slice.turnEpoch + 1,
        activeAssistantId: assistantId,
        turnStartedAt: Date.now(),
        lastSeq: null,
        error: null,
        permissions: [],
        permission: null,
      });
      seqRefs.lastSeq = null;
    },
    applyEvent(event: SseEnvelope) {
      if (!slice.activeAssistantId) return 'continue';
      const assistantId = slice.activeAssistantId;

      if (event.type === 'thinking' || event.type === 'token') {
        const delta = (event.payload as { delta?: string }).delta ?? '';
        noteEventSeq(seqRefs, event);
        batcher.enqueue(
          slice.sessionId ?? 'local',
          assistantId,
          event.type === 'thinking' ? 'thinking' : 'token',
          delta,
        );
        slice = { ...slice, lastSeq: seqRefs.lastSeq };
        return 'continue';
      }

      batcher.flushSession(slice.sessionId ?? 'local');
      const result = reduceEvent(
        {
          messages: slice.messages,
          mode: slice.mode,
          modelRef: slice.modelRef,
          contextUsage: slice.contextUsage,
          permissions: slice.permissions,
        },
        event,
        assistantId,
        {
          batcher,
          isFocused: true,
          seqRefs,
          t,
        },
      );
      applyEffects(result.effects);
      const permissions =
        result.state.permissions !== undefined
          ? result.state.permissions
          : slice.permissions;
      set({
        ...slice,
        messages: result.state.messages,
        mode: result.state.mode ?? slice.mode,
        modelRef:
          result.state.modelRef !== undefined ? result.state.modelRef : slice.modelRef,
        contextUsage:
          result.state.contextUsage !== undefined
            ? result.state.contextUsage
            : slice.contextUsage,
        permissions,
        permission: permissions[0] ?? null,
        lastSeq: seqRefs.lastSeq,
        status: result.action === 'break' ? 'error' : slice.status,
      });
      return result.action;
    },
    endTurn(stopped = false) {
      batcher.flushSession(slice.sessionId ?? 'local');
      const aid = slice.activeAssistantId;
      const workedMs =
        slice.turnStartedAt != null ? Date.now() - slice.turnStartedAt : undefined;
      const lastTurnWorkedSec =
        workedMs != null ? Math.max(1, Math.round(workedMs / 1000)) : slice.lastTurnWorkedSec;
      let messages = slice.messages;
      if (aid) {
        messages = messages.map((m) => {
          if (m.id !== aid) return m;
          if (m.status === 'streaming') {
            return {
              ...m,
              status: 'completed' as const,
              workedMs: workedMs ?? m.workedMs,
              turnMode: m.turnMode ?? slice.mode,
              turnModelLabel: m.turnModelLabel ?? slice.modelRef?.modelId,
            };
          }
          return m;
        });
      }
      set({
        ...slice,
        messages,
        status: 'idle',
        activeAssistantId: null,
        turnStartedAt: null,
        lastTurnWorkedSec,
        permissions: stopped ? [] : slice.permissions,
        permission: stopped ? null : slice.permissions[0] ?? null,
      });
    },
    patch(partial) {
      const next = { ...slice, ...partial };
      if (partial.permissions) {
        next.permission = partial.permissions[0] ?? null;
      } else if (partial.permission === null) {
        next.permissions = [];
      }
      set(next);
    },
  };
}
