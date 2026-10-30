import type {
  ContextUsageSnapshot,
  FileChangeRecord,
  HarnessMode,
  ModeSuggestedPayload,
  ModelRef,
  PlanQuestionPayload,
  SseEnvelope,
  SubagentType,
} from '@ciro-code/harness-shared';

import {
  createCompactionChatMessage,
  shouldPersistCompactionMarker,
  type ChatMessage,
} from './chat-message.js';
import type { StreamDeltaBatcher } from './stream-delta-batcher.js';
import { noteEventSeq } from './seq-watermark.js';
import {
  applyFileChangedDiff,
  applyModeSuggested,
  applyPlanConfirmed,
  applyPlanQuestion,
  applyPlanTimeline,
  applyStreamComplete,
  applyStreamError,
  applySubagentTimeline,
  applyToolCallResult,
  applyToolCallStart,
} from './stream-event-messages.js';
import type { TranslateFn } from './translate.js';

/** 权限卡（与 UI PermissionPrompt 字段对齐，避免依赖 harness-ui） */
export interface PermissionRequestState {
  permissionId: string;
  toolName: string;
  reason?: string;
  toolInput?: Record<string, unknown>;
  toolCallId?: string;
}

/** 对话区压缩状态（替代 toast） */
export interface CompactionNoticeState {
  status: 'running' | 'done' | 'suggested';
  method?: string;
  narrative?: string;
  tokensSaved?: number;
  usageRatio?: number;
  recommended?: string;
}

/** reduceEvent 操作的会话切片子集 */
export interface ReduceChatSlice {
  messages: ChatMessage[];
  mode?: HarnessMode;
  modelRef?: ModelRef | null;
  contextUsage?: ContextUsageSnapshot | null;
  /** 并行工具可能同时挂起多个权限请求 */
  permissions?: PermissionRequestState[];
  compactionNotice?: CompactionNoticeState | null;
}

export type ReduceEffect =
  | { type: 'toast'; kind: 'info' | 'success' | 'error'; message: string }
  | { type: 'setMode'; mode: HarnessMode }
  | { type: 'setModelRef'; modelRef: ModelRef | null }
  | { type: 'setError'; message: string }
  | { type: 'sideEvent'; eventType: string; payload: unknown }
  | {
      type: 'setPlanQuestions';
      value: { id: string; questions: PlanQuestionPayload['questions'] } | null;
    }
  | { type: 'onErrorBreak' };

export interface ReduceCtx {
  batcher: StreamDeltaBatcher;
  isFocused: boolean;
  /** seq watermark；仅当事件带 seq 时更新 */
  seqRefs: { lastSeq: number | null };
  t: TranslateFn;
}

export interface ReduceEventResult {
  state: ReduceChatSlice;
  action: 'continue' | 'break';
  effects: ReduceEffect[];
}

/**
 * 纯归约：消费一条 SSE，更新切片并返回声明式 effects（由 Web/TUI 胶水执行）。
 * thinking/token 走 batcher，不直接改 messages。
 */
export function reduceEvent(
  state: ReduceChatSlice,
  event: SseEnvelope,
  assistantId: string,
  ctx: ReduceCtx,
): ReduceEventResult {
  const effects: ReduceEffect[] = [];
  let next: ReduceChatSlice = state;
  noteEventSeq(ctx.seqRefs, event);

  // thinking/token 必须走 reduceEventForSession（需要 sessionId 合批）
  if (event.type === 'thinking' || event.type === 'token') {
    return { state: next, action: 'continue', effects };
  }

  if (event.type === 'mode_changed') {
    const mode = (event.payload as { mode?: HarnessMode }).mode;
    if (mode) {
      next = { ...next, mode };
      if (ctx.isFocused) effects.push({ type: 'setMode', mode });
    }
  } else if (event.type === 'model_changed') {
    const modelRef = (event.payload as { modelRef?: ModelRef | null }).modelRef ?? null;
    next = { ...next, modelRef };
    if (ctx.isFocused) effects.push({ type: 'setModelRef', modelRef });
  } else if (event.type === 'context_usage') {
    next = { ...next, contextUsage: event.payload as ContextUsageSnapshot };
  } else if (event.type === 'skill_activated') {
    const p = event.payload as { names?: string[] };
    if (p.names?.length && ctx.isFocused) {
      effects.push({
        type: 'toast',
        kind: 'info',
        message: ctx.t('toast.skill', { names: p.names.join(', ') }),
      });
    }
  } else if (event.type === 'ui_notify') {
    const p = event.payload as { level?: string; message?: string };
    if (p.message && ctx.isFocused) {
      const kind =
        p.level === 'success' || p.level === 'error' || p.level === 'info' ? p.level : 'info';
      effects.push({ type: 'toast', kind, message: p.message });
    }
  } else if (event.type === 'compaction_suggested') {
    const p = event.payload as { usageRatio?: number; recommended?: string };
    next = {
      ...next,
      compactionNotice: {
        status: 'suggested',
        usageRatio: p.usageRatio,
        recommended: p.recommended,
      },
    };
  } else if (event.type === 'compaction_progress') {
    const p = event.payload as { method?: string; stage?: string };
    // micro 不展示压缩条（含 running）
    if (p.method !== 'micro') {
      next = {
        ...next,
        compactionNotice: {
          status: 'running',
          method: p.method,
        },
      };
    }
  } else if (event.type === 'compaction_completed') {
    const p = event.payload as {
      contextUsage?: ContextUsageSnapshot;
      result?: {
        narrative?: string;
        metadata?: { method?: string; tokensSaved?: number };
      };
    };
    const method = p.result?.metadata?.method;
    const tokensSaved = p.result?.metadata?.tokensSaved;
    const narrative = p.result?.narrative;
    const persist = shouldPersistCompactionMarker(method);
    next = {
      ...next,
      contextUsage: p.contextUsage ?? next.contextUsage,
      messages: persist
        ? [
            ...next.messages,
            createCompactionChatMessage({
              method,
              tokensSaved,
              narrative,
            }),
          ]
        : next.messages,
      // SM/full → 时间线分隔条；micro → 静默（不展示压缩条）
      compactionNotice: null,
    };
  } else if (event.type === 'permission_request') {
    const req = event.payload as PermissionRequestState;
    const prev = next.permissions ?? [];
    const without = prev.filter((p) => p.permissionId !== req.permissionId);
    next = { ...next, permissions: [...without, req] };
  } else if (event.type === 'permission_resolved') {
    const p = event.payload as { permissionId?: string };
    const prev = next.permissions ?? [];
    next = {
      ...next,
      permissions: p.permissionId
        ? prev.filter((x) => x.permissionId !== p.permissionId)
        : [],
    };
  } else if (event.type === 'plan_confirmed') {
    const p = event.payload as { mode?: HarnessMode; planId?: string };
    if (p.mode) {
      next = { ...next, mode: p.mode };
      if (ctx.isFocused) effects.push({ type: 'setMode', mode: p.mode });
    }
    if (p.planId) {
      next = { ...next, messages: applyPlanConfirmed(next.messages, p.planId) };
    }
    if (ctx.isFocused) {
      effects.push({ type: 'sideEvent', eventType: event.type, payload: event.payload });
    }
  } else if (event.type === 'plan_created' || event.type === 'plan_updated') {
    const p = event.payload as {
      planId: string;
      title: string;
      markdown: string;
      confirmedAt?: number;
    };
    if (p.planId) {
      next = {
        ...next,
        messages: applyPlanTimeline(next.messages, assistantId, p),
      };
    }
    if (ctx.isFocused) {
      effects.push({ type: 'sideEvent', eventType: event.type, payload: event.payload });
    }
  } else if (
    event.type === 'subagent_start' ||
    event.type === 'subagent_progress' ||
    event.type === 'subagent_completed'
  ) {
    const p = event.payload as {
      taskId: string;
      title?: string;
      subagentType?: SubagentType;
      status?: 'running' | 'completed' | 'failed' | 'stopped';
      progressText?: string;
      reason?: string;
      error?: string;
      background?: boolean;
    };
    if (p.taskId) {
      const status =
        p.status ?? (event.type === 'subagent_completed' ? 'completed' : 'running');
      next = {
        ...next,
        messages: applySubagentTimeline(next.messages, assistantId, {
          taskId: p.taskId,
          title: p.title,
          subagentType: p.subagentType,
          status,
          progressText: p.progressText,
          reason: p.reason,
          error: p.error,
          background: p.background,
        }),
      };
    }
  } else if (event.type === 'file_changed') {
    if (ctx.isFocused) {
      effects.push({ type: 'sideEvent', eventType: event.type, payload: event.payload });
    }
    const change = event.payload as FileChangeRecord;
    next = {
      ...next,
      messages: applyFileChangedDiff(next.messages, assistantId, change),
    };
  } else if (event.type === 'mode_suggested') {
    const p = event.payload as ModeSuggestedPayload;
    if (!p.suggestedMode || !p.suggestId) {
      return { state: next, action: 'continue', effects };
    }
    next = {
      ...next,
      messages: applyModeSuggested(next.messages, assistantId, p),
    };
  } else if (event.type === 'plan_question') {
    const p = event.payload as PlanQuestionPayload;
    if (p.questionId && p.questions?.length) {
      next = {
        ...next,
        messages: applyPlanQuestion(next.messages, assistantId, p),
      };
      if (ctx.isFocused) {
        effects.push({
          type: 'setPlanQuestions',
          value: { id: p.questionId, questions: p.questions },
        });
      }
    }
  } else if (event.type === 'tool_call_start') {
    const p = event.payload as {
      toolCallId: string;
      toolName: string;
      toolInput?: Record<string, unknown>;
    };
    next = {
      ...next,
      messages: applyToolCallStart(next.messages, assistantId, p),
    };
  } else if (event.type === 'tool_call_result') {
    const p = event.payload as {
      toolCallId: string;
      toolName?: string;
      resultPreview?: string;
      isError?: boolean;
    };
    next = {
      ...next,
      messages: applyToolCallResult(next.messages, assistantId, p),
    };
  } else if (event.type === 'error') {
    const msg = (event.payload as { message?: string }).message ?? 'Unknown error';
    next = {
      ...next,
      messages: applyStreamError(next.messages, assistantId, msg),
    };
    if (ctx.isFocused) {
      effects.push({ type: 'setError', message: msg });
      effects.push({ type: 'setPlanQuestions', value: null });
    }
    effects.push({ type: 'onErrorBreak' });
    return { state: next, action: 'break', effects };
  } else if (event.type === 'complete') {
    next = {
      ...next,
      messages: applyStreamComplete(next.messages, assistantId),
    };
    if (ctx.isFocused) {
      effects.push({ type: 'setPlanQuestions', value: null });
    }
  } else if (ctx.isFocused) {
    // debug_* 等侧栏事件：只声明 sideEvent，由胶水在 setState 外执行（禁止在 updater 内调 setState）
    effects.push({ type: 'sideEvent', eventType: event.type, payload: event.payload });
  }

  return { state: next, action: 'continue', effects };
}

/**
 * 带 sessionId 的入口：正确 flush / enqueue delta。
 *
 * **调用约束**：`thinking`/`token` 的 enqueue 有外部副作用，禁止放在 React
 * `setState` updater 内（Strict Mode 会双调 updater → delta 翻倍）。Web 胶水应在
 * updater 外先处理 delta，或仅对非 delta 事件调用本函数。
 */
export function reduceEventForSession(
  state: ReduceChatSlice,
  sessionId: string,
  event: SseEnvelope,
  assistantId: string,
  ctx: ReduceCtx,
): ReduceEventResult {
  if (event.type === 'thinking' || event.type === 'token') {
    const delta = (event.payload as { delta?: string }).delta ?? '';
    const kind = event.type === 'thinking' ? 'thinking' : 'token';
    noteEventSeq(ctx.seqRefs, event);
    ctx.batcher.enqueue(sessionId, assistantId, kind, delta);
    return { state, action: 'continue', effects: [] };
  }
  ctx.batcher.flushSession(sessionId);
  return reduceEvent(state, event, assistantId, ctx);
}
