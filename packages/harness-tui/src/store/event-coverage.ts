import type { HarnessSseEventType, SseEnvelope } from '@ciro-code/harness-shared';
import { reduceEvent, createStreamDeltaBatcher, type ReduceChatSlice } from '@ciro-code/harness-timeline';

/** 与 shared `HarnessSseEventType` 全集对齐（守卫测试用；当前 37 项） */
export const ALL_SSE_EVENT_TYPES: readonly HarnessSseEventType[] = [
  'token',
  'thinking',
  'tool_call_start',
  'tool_call_result',
  'complete',
  'error',
  'mode_changed',
  'model_changed',
  'permission_request',
  'permission_resolved',
  'context_usage',
  'memory_injected',
  'skill_activated',
  'rules_injected',
  'mcp_tools_changed',
  'ui_notify',
  'compaction_suggested',
  'compaction_progress',
  'compaction_completed',
  'session_recovered',
  'attach_snapshot',
  'providers_updated',
  'plan_question',
  'plan_created',
  'plan_updated',
  'plan_confirmed',
  'debug_session_started',
  'debug_waiting_repro',
  'debug_logs_ready',
  'debug_session_stopped',
  'mode_suggested',
  'file_changed',
  'session_busy',
  'session_idle',
  'subagent_start',
  'subagent_progress',
  'subagent_completed',
] as const;

/**
 * 断言每个 SSE 事件类型都能安全过 reduceEvent（不抛）。
 * 未知/侧栏事件会落为 sideEvent effect。
 */
export function assertAllEventsHandled(): void {
  const batcher = createStreamDeltaBatcher(() => undefined, {
    schedule: () => 1,
    cancel: () => undefined,
  });
  const empty: ReduceChatSlice = {
    messages: [
      { id: 'a1', role: 'assistant', content: '', status: 'streaming', timeline: [] },
    ],
    permissions: [],
    contextUsage: null,
  };
  const t = (key: string) => key;

  for (const type of ALL_SSE_EVENT_TYPES) {
    const event = {
      type,
      ts: Date.now(),
      payload: minimalPayload(type),
    } as SseEnvelope;
    reduceEvent(empty, event, 'a1', {
      batcher,
      isFocused: true,
      seqRefs: { lastSeq: null },
      t,
    });
  }
}

function minimalPayload(type: HarnessSseEventType): unknown {
  switch (type) {
    case 'token':
    case 'thinking':
      return { delta: 'x' };
    case 'tool_call_start':
      return { toolCallId: 't1', toolName: 'read', toolInput: {} };
    case 'tool_call_result':
      return { toolCallId: 't1', toolName: 'read', resultPreview: 'ok' };
    case 'error':
      return { message: 'err' };
    case 'mode_changed':
      return { mode: 'ask' };
    case 'model_changed':
      return { modelRef: null };
    case 'permission_request':
      return { permissionId: 'p1', toolName: 'bash' };
    case 'context_usage':
      return {
        sessionId: 's1',
        estimated: true,
        modelContextLimit: 100,
        reservedOutputTokens: 0,
        effectiveLimit: 100,
        totalTokens: 1,
        usageRatio: 0.01,
        urgency: 'none',
        buckets: [],
        updatedAt: new Date().toISOString(),
      };
    case 'skill_activated':
      return { names: ['s'] };
    case 'ui_notify':
      return { level: 'info', message: 'hi' };
    case 'compaction_suggested':
      return { usageRatio: 0.9, recommended: 'compact' };
    case 'compaction_completed':
      return { result: { narrative: 'done' } };
    case 'plan_question':
      return {
        questionId: 'q1',
        questions: [{ id: 'q1', prompt: '?', options: [{ id: 'a', label: 'A' }] }],
      };
    case 'plan_created':
    case 'plan_updated':
      return { planId: 'p1', title: 't', markdown: '#', todos: [] };
    case 'plan_confirmed':
      return { planId: 'p1', mode: 'agent' };
    case 'mode_suggested':
      return { suggestId: 's1', suggestedMode: 'agent', reason: 'x' };
    case 'file_changed':
      return {
        path: 'a.ts',
        operation: 'edit',
        summary: 'edit',
        unifiedDiff: '',
        ts: Date.now(),
      };
    case 'subagent_start':
    case 'subagent_progress':
    case 'subagent_completed':
      return { taskId: 'task1', title: 't', status: 'running' };
    case 'debug_session_started':
      return { debugSessionId: 'd1', ingestUrl: 'http://127.0.0.1', logPath: '/tmp/x' };
    default:
      return {};
  }
}
