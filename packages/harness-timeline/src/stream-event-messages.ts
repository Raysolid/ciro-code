import type { FileChangeRecord, ModeSuggestedPayload, PlanQuestionPayload, SubagentType } from '@ciro-code/harness-shared';
import type { ChatMessage } from './chat-message.js';
import { diffItemFromChange, PLAN_TOOL_NAMES, SILENT_TOOL_NAMES } from './types.js';
import {
  confirmPlanInMessages,
  abortInFlightTimeline,
  endActiveText,
  endActiveThought,
  messageHasTimelineContent,
  resolveModeSuggest,
  resolveAskQuestion,
  applyAskQuestionToolPreview,
  updateMessage,
  upsertDiffItem,
  upsertModeSuggest,
  upsertAskQuestion,
  upsertPlanItem,
  upsertSubagentItem,
  upsertToolResult,
  upsertToolStart,
} from './message-timeline.js';

export function applyToolCallStart(
  messages: ChatMessage[],
  assistantId: string,
  payload: {
    toolCallId: string;
    toolName: string;
    toolInput?: Record<string, unknown>;
  },
): ChatMessage[] {
  // SuggestMode / CreatePlan / Task 走专用卡片，不进工具时间线
  if (
    payload.toolName === 'SuggestMode' ||
    payload.toolName === 'AskQuestion' ||
    payload.toolName === 'Task' ||
    PLAN_TOOL_NAMES.has(payload.toolName) ||
    SILENT_TOOL_NAMES.has(payload.toolName)
  ) {
    return messages;
  }
  return upsertToolStart(messages, assistantId, payload);
}

export function applyToolCallResult(
  messages: ChatMessage[],
  assistantId: string,
  payload: {
    toolCallId: string;
    toolName?: string;
    resultPreview?: string;
    isError?: boolean;
  },
): ChatMessage[] {
  if (payload.toolName === 'AskQuestion') {
    return applyAskQuestionToolPreview(messages, assistantId, payload.resultPreview);
  }
  if (
    payload.toolName === 'SuggestMode' ||
    payload.toolName === 'Task' ||
    (payload.toolName && PLAN_TOOL_NAMES.has(payload.toolName)) ||
    (payload.toolName && SILENT_TOOL_NAMES.has(payload.toolName))
  ) {
    return messages;
  }
  return upsertToolResult(messages, assistantId, payload);
}

export function applyFileChangedDiff(
  messages: ChatMessage[],
  assistantId: string,
  change: FileChangeRecord,
): ChatMessage[] {
  return upsertDiffItem(
    endActiveThought(messages, assistantId),
    assistantId,
    diffItemFromChange(change),
  );
}

export function applyModeSuggested(
  messages: ChatMessage[],
  assistantId: string,
  payload: ModeSuggestedPayload,
): ChatMessage[] {
  return upsertModeSuggest(messages, assistantId, payload);
}

export function applyModeSuggestResolved(
  messages: ChatMessage[],
  assistantId: string,
  suggestId: string,
  status: 'skipped' | 'switched',
): ChatMessage[] {
  return resolveModeSuggest(messages, assistantId, suggestId, status);
}

export function applyPlanQuestion(
  messages: ChatMessage[],
  assistantId: string,
  payload: PlanQuestionPayload,
): ChatMessage[] {
  return upsertAskQuestion(messages, assistantId, payload);
}

export function applyPlanQuestionResolved(
  messages: ChatMessage[],
  assistantId: string,
  questionId: string,
  status: 'answered' | 'skipped',
  answers?: import('@ciro-code/harness-shared').PlanQuestionAnswer[],
): ChatMessage[] {
  return resolveAskQuestion(messages, assistantId, questionId, status, answers);
}

export function applyPlanTimeline(
  messages: ChatMessage[],
  assistantId: string,
  payload: {
    planId: string;
    title: string;
    markdown: string;
    confirmedAt?: number;
  },
): ChatMessage[] {
  return upsertPlanItem(messages, assistantId, payload);
}

export function applySubagentTimeline(
  messages: ChatMessage[],
  assistantId: string,
  payload: {
    taskId: string;
    title?: string;
    subagentType?: SubagentType;
    status: 'running' | 'completed' | 'failed' | 'stopped';
    progressText?: string;
    reason?: string;
    error?: string;
    background?: boolean;
  },
): ChatMessage[] {
  return upsertSubagentItem(messages, assistantId, payload);
}

export function applyPlanConfirmed(messages: ChatMessage[], planId: string): ChatMessage[] {
  return confirmPlanInMessages(messages, planId);
}

export function applyStreamError(
  messages: ChatMessage[],
  assistantId: string,
  message: string,
): ChatMessage[] {
  return updateMessage(
    endActiveText(endActiveThought(messages, assistantId), assistantId),
    assistantId,
    (m) => ({
      ...m,
      content: message,
      status: 'error',
    }),
  );
}

export function applyStreamComplete(
  messages: ChatMessage[],
  assistantId: string,
): ChatMessage[] {
  return updateMessage(
    endActiveText(endActiveThought(messages, assistantId), assistantId),
    assistantId,
    (m) => ({
      ...m,
      status: 'completed',
    }),
  );
}

/** 去掉空 streaming 助手气泡；其余 streaming → completed，并按 abort 收口时间线 */
export function settleStreamingMessages(prev: ChatMessage[]): ChatMessage[] {
  return prev
    .filter(
      (m) =>
        !(
          m.role === 'assistant' &&
          m.status === 'streaming' &&
          !messageHasTimelineContent(m)
        ),
    )
    .map((m) =>
      m.status === 'streaming'
        ? {
            ...m,
            status: 'completed' as const,
            timeline: abortInFlightTimeline(m.timeline),
          }
        : m,
    );
}
