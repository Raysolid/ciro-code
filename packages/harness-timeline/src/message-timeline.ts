import type { ChatMessage } from './chat-message.js';
import type { HarnessMode, PlanQuestionAnswer, PlanQuestionItem, SubagentType } from '@ciro-code/harness-shared';
import type {
  TimelineItem,
  TextTimelineItem,
  ThoughtTimelineItem,
  ToolTimelineItem,
  ModeSuggestTimelineItem,
  AskQuestionTimelineItem,
  PlanTimelineItem,
} from './types.js';
import { planCardOverview, parseAskQuestionPreview } from './types.js';

export function updateMessage(
  prev: ChatMessage[],
  messageId: string,
  updater: (m: ChatMessage) => ChatMessage,
): ChatMessage[] {
  return prev.map((m) => (m.id === messageId ? updater(m) : m));
}

export function contentFromTimeline(timeline: TimelineItem[] | undefined): string {
  if (!timeline?.length) return '';
  return timeline
    .filter((i): i is TextTimelineItem => i.kind === 'text')
    .map((i) => i.text)
    .join('');
}

export function patchTimeline(
  prev: ChatMessage[],
  messageId: string,
  patch: (timeline: TimelineItem[]) => TimelineItem[],
  opts?: { syncContent?: boolean },
): ChatMessage[] {
  return updateMessage(prev, messageId, (m) => {
    const timeline = patch(m.timeline ? [...m.timeline] : []);
    if (opts?.syncContent) {
      return { ...m, timeline, content: contentFromTimeline(timeline) };
    }
    return { ...m, timeline };
  });
}

export function appendTimelineItem(
  prev: ChatMessage[],
  messageId: string,
  item: TimelineItem,
): ChatMessage[] {
  return patchTimeline(prev, messageId, (tl) => [...tl, item]);
}

/** tool / thinking / diff 到来时封闭当前 text 分段 */
export function endActiveText(prev: ChatMessage[], messageId: string): ChatMessage[] {
  return patchTimeline(prev, messageId, (tl) =>
    tl.map((item) => {
      if (item.kind !== 'text' || item.ended) return item;
      return { ...item, ended: true };
    }),
  );
}

export function upsertThoughtDelta(
  prev: ChatMessage[],
  messageId: string,
  delta: string,
  now = Date.now(),
): ChatMessage[] {
  let next = endActiveText(prev, messageId);
  return patchTimeline(next, messageId, (tl) => {
    const idx = tl.findIndex((i) => i.kind === 'thought' && !i.ended);
    if (idx >= 0) {
      const cur = tl[idx] as ThoughtTimelineItem;
      const copy = [...tl];
      copy[idx] = { ...cur, text: cur.text + delta };
      return copy;
    }
    const thought: ThoughtTimelineItem = {
      kind: 'thought',
      id: `thought-${messageId}-${now}`,
      text: delta,
      startedAt: now,
    };
    return [...tl, thought];
  });
}

function closeThoughtItem(item: ThoughtTimelineItem, now: number): ThoughtTimelineItem {
  if (item.ended) return item;
  return {
    ...item,
    ended: true,
    durationSec: Math.max(1, Math.round((now - item.startedAt) / 1000)),
  };
}

/** token / tool / complete 时冻结 Thought 时长 */
export function endActiveThought(
  prev: ChatMessage[],
  messageId: string,
  now = Date.now(),
): ChatMessage[] {
  return patchTimeline(prev, messageId, (tl) =>
    tl.map((item) => (item.kind === 'thought' ? closeThoughtItem(item, now) : item)),
  );
}

/** 仅 abort/settle：封口思考与正文，收掉 running 工具，跳过未答提问 */
export function abortInFlightTimeline(
  timeline: TimelineItem[] | undefined,
  now = Date.now(),
): TimelineItem[] | undefined {
  if (!timeline?.length) return timeline;
  return timeline.map((item) => {
    if (item.kind === 'thought') return closeThoughtItem(item, now);
    if (item.kind === 'text' && !item.ended) return { ...item, ended: true };
    if (item.kind === 'tool' && item.status === 'running') return { ...item, status: 'done' };
    if (item.kind === 'subagent' && item.status === 'running') return { ...item, status: 'stopped' };
    if (item.kind === 'ask_question' && item.status === 'pending') {
      return { ...item, status: 'skipped' };
    }
    if (item.kind === 'mode_suggest' && item.status === 'pending') {
      return { ...item, status: 'skipped' };
    }
    return item;
  });
}

/** 流式 token → text part；同步 message.content */
export function upsertTextDelta(
  prev: ChatMessage[],
  messageId: string,
  delta: string,
  now = Date.now(),
): ChatMessage[] {
  let next = endActiveThought(prev, messageId, now);
  return patchTimeline(
    next,
    messageId,
    (tl) => {
      const idx = tl.findIndex((i) => i.kind === 'text' && !i.ended);
      if (idx >= 0) {
        const cur = tl[idx] as TextTimelineItem;
        const copy = [...tl];
        copy[idx] = { ...cur, text: cur.text + delta };
        return copy;
      }
      const textItem: TextTimelineItem = {
        kind: 'text',
        id: `text-${messageId}-${now}`,
        text: delta,
      };
      return [...tl, textItem];
    },
    { syncContent: true },
  );
}

export function upsertToolStart(
  prev: ChatMessage[],
  messageId: string,
  tool: {
    toolCallId: string;
    toolName: string;
    toolInput?: Record<string, unknown>;
  },
): ChatMessage[] {
  let next = endActiveText(prev, messageId);
  next = endActiveThought(next, messageId);
  return patchTimeline(next, messageId, (tl) => {
    const existing = tl.findIndex((i) => i.kind === 'tool' && i.id === tool.toolCallId);
    const item: ToolTimelineItem = {
      kind: 'tool',
      id: tool.toolCallId,
      toolName: tool.toolName,
      status: 'running',
      toolInput: tool.toolInput,
    };
    if (existing >= 0) {
      const copy = [...tl];
      copy[existing] = { ...item, preview: (tl[existing] as ToolTimelineItem).preview };
      return copy;
    }
    return [...tl, item];
  });
}

export function upsertToolResult(
  prev: ChatMessage[],
  messageId: string,
  tool: {
    toolCallId: string;
    toolName?: string;
    resultPreview?: string;
    isError?: boolean;
  },
): ChatMessage[] {
  return patchTimeline(prev, messageId, (tl) => {
    const idx = tl.findIndex((i) => i.kind === 'tool' && i.id === tool.toolCallId);
    if (idx < 0) {
      const item: ToolTimelineItem = {
        kind: 'tool',
        id: tool.toolCallId,
        toolName: tool.toolName ?? 'tool',
        status: tool.isError ? 'error' : 'done',
        preview: tool.resultPreview,
      };
      return [...tl, item];
    }
    const cur = tl[idx] as ToolTimelineItem;
    const copy = [...tl];
    copy[idx] = {
      ...cur,
      status: tool.isError ? 'error' : 'done',
      preview: tool.resultPreview ?? cur.preview,
      toolName: tool.toolName ?? cur.toolName,
    };
    return copy;
  });
}

export function upsertDiffItem(
  prev: ChatMessage[],
  messageId: string,
  item: Extract<TimelineItem, { kind: 'diff' }>,
): ChatMessage[] {
  let next = endActiveText(prev, messageId);
  next = endActiveThought(next, messageId);
  return patchTimeline(next, messageId, (tl) => {
    const byTool =
      item.toolCallId != null
        ? tl.findIndex((i) => i.kind === 'diff' && i.toolCallId === item.toolCallId)
        : -1;
    const byPath = tl.findIndex((i) => i.kind === 'diff' && i.path === item.path);
    const idx = byTool >= 0 ? byTool : byPath;
    if (idx >= 0) {
      const copy = [...tl];
      copy[idx] = item;
      return copy;
    }
    return [...tl, item];
  });
}

export function setWorkedFor(
  prev: ChatMessage[],
  messageId: string,
  workedMs: number,
  stopped = false,
): ChatMessage[] {
  return patchTimeline(prev, messageId, (tl) => {
    const without = tl.filter((i) => i.kind !== 'worked');
    return [
      ...without,
      { kind: 'worked', id: `worked-${messageId}`, workedMs, stopped },
    ];
  });
}

export function upsertModeSuggest(
  prev: ChatMessage[],
  messageId: string,
  payload: {
    suggestId: string;
    suggestedMode: HarnessMode;
    currentMode: HarnessMode;
    reason: string;
  },
  now = Date.now(),
): ChatMessage[] {
  return patchTimeline(prev, messageId, (tl) => {
    if (tl.some((i) => i.kind === 'mode_suggest' && i.id === payload.suggestId)) return tl;
    const item: ModeSuggestTimelineItem = {
      kind: 'mode_suggest',
      id: payload.suggestId,
      suggestedMode: payload.suggestedMode,
      currentMode: payload.currentMode,
      reason: payload.reason,
      status: 'pending',
      startedAt: now,
    };
    return [...tl, item];
  });
}

export function resolveModeSuggest(
  prev: ChatMessage[],
  messageId: string,
  suggestId: string,
  status: 'skipped' | 'switched',
): ChatMessage[] {
  return patchTimeline(prev, messageId, (tl) =>
    tl.map((item) => {
      if (item.kind !== 'mode_suggest' || item.id !== suggestId) return item;
      if (item.status !== 'pending') return item;
      return { ...item, status };
    }),
  );
}

export function upsertAskQuestion(
  prev: ChatMessage[],
  messageId: string,
  payload: { questionId: string; questions: PlanQuestionItem[] },
): ChatMessage[] {
  const already = prev
    .find((m) => m.id === messageId)
    ?.timeline?.some((i) => i.kind === 'ask_question' && i.id === payload.questionId);
  if (already) return prev;
  let next = endActiveText(prev, messageId);
  next = endActiveThought(next, messageId);
  return patchTimeline(next, messageId, (tl) => [
    ...tl,
    {
      kind: 'ask_question',
      id: payload.questionId,
      questions: payload.questions,
      status: 'pending',
    },
  ]);
}

export function resolveAskQuestion(
  prev: ChatMessage[],
  messageId: string,
  questionId: string,
  status: 'answered' | 'skipped',
  answers?: PlanQuestionAnswer[],
): ChatMessage[] {
  return patchTimeline(prev, messageId, (tl) => {
    let idx = tl.findIndex((i) => i.kind === 'ask_question' && i.id === questionId);
    if (idx < 0) {
      for (let i = tl.length - 1; i >= 0; i -= 1) {
        const it = tl[i]!;
        if (it.kind === 'ask_question' && it.status === 'pending') {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) return tl;
    const item = tl[idx] as AskQuestionTimelineItem;
    const copy = [...tl];
    copy[idx] = { ...item, status, answers: answers ?? item.answers };
    return copy;
  });
}

export function applyAskQuestionToolPreview(
  prev: ChatMessage[],
  messageId: string,
  preview?: string,
): ChatMessage[] {
  const parsed = parseAskQuestionPreview(preview);
  return patchTimeline(prev, messageId, (tl) => {
    let pending = -1;
    let any = -1;
    for (let i = tl.length - 1; i >= 0; i -= 1) {
      const it = tl[i]!;
      if (it.kind !== 'ask_question') continue;
      if (any < 0) any = i;
      if (pending < 0 && it.status === 'pending') pending = i;
      if (pending >= 0 && any >= 0) break;
    }
    const idx = pending >= 0 ? pending : any;
    if (idx < 0) return tl;
    const item = tl[idx] as AskQuestionTimelineItem;
    if (parsed.skipped) {
      const copy = [...tl];
      copy[idx] = { ...item, status: 'skipped' };
      return copy;
    }
    if (!parsed.answers?.length) return tl;
    const copy = [...tl];
    copy[idx] = { ...item, status: 'answered', answers: parsed.answers };
    return copy;
  });
}

export function upsertPlanItem(
  prev: ChatMessage[],
  messageId: string,
  payload: {
    planId: string;
    title: string;
    markdown: string;
    confirmedAt?: number;
  },
): ChatMessage[] {
  const hostId =
    prev.find((m) => m.timeline?.some((i) => i.kind === 'plan' && i.planId === payload.planId))
      ?.id ?? messageId;
  return patchTimeline(prev, hostId, (tl) => {
    const overview = planCardOverview(payload.markdown);
    const status: PlanTimelineItem['status'] = payload.confirmedAt ? 'confirmed' : 'pending';
    const existing = tl.findIndex((i) => i.kind === 'plan' && i.planId === payload.planId);
    if (existing >= 0) {
      return tl.map((item, idx) => {
        if (idx !== existing || item.kind !== 'plan') return item;
        return {
          ...item,
          title: payload.title || item.title,
          overview: overview || item.overview,
          status: status === 'confirmed' ? 'confirmed' : item.status,
        };
      });
    }
    const item: PlanTimelineItem = {
      kind: 'plan',
      id: `plan-${payload.planId}`,
      planId: payload.planId,
      title: payload.title || 'Plan',
      overview,
      status,
    };
    return [...tl, item];
  });
}

/** 按 planId 标记所有消息中的计划卡片为已确认 */
export function confirmPlanInMessages(prev: ChatMessage[], planId: string): ChatMessage[] {
  return prev.map((m) => {
    if (!m.timeline?.some((i) => i.kind === 'plan' && i.planId === planId)) return m;
    return {
      ...m,
      timeline: m.timeline.map((item) =>
        item.kind === 'plan' && item.planId === planId
          ? { ...item, status: 'confirmed' as const }
          : item,
      ),
    };
  });
}

export function upsertSubagentItem(
  prev: ChatMessage[],
  messageId: string,
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
  return patchTimeline(prev, messageId, (tl) => {
    const existing = tl.findIndex(
      (i) => i.kind === 'subagent' && i.taskId === payload.taskId,
    );
    if (existing >= 0) {
      return tl.map((item, idx) => {
        if (idx !== existing || item.kind !== 'subagent') return item;
        return {
          ...item,
          title: payload.title ?? item.title,
          status: payload.status,
          progressText: payload.progressText ?? item.progressText,
          reason: payload.reason ?? item.reason,
          error: payload.error ?? item.error,
          background: payload.background ?? item.background,
        };
      });
    }
    const item: import('./types.js').SubagentTimelineItem = {
      kind: 'subagent',
      id: `subagent-${payload.taskId}`,
      taskId: payload.taskId,
      title: payload.title || 'Explore',
      subagentType: payload.subagentType ?? 'explore',
      status: payload.status,
      progressText: payload.progressText,
      reason: payload.reason,
      error: payload.error,
      ...(payload.background ? { background: true } : {}),
    };
    return [...tl, item];
  });
}

/**
 * Resume：把 listSubagents meta 回填到已有 Task→subagent 占位（保持时间线顺序）。
 * 无占位时丢弃未匹配 meta（不做挂尾兜底）。
 */
export function mergeSubagentMetasOnResume(
  messages: ChatMessage[],
  metas: Array<{
    taskId: string;
    title: string;
    subagentType?: SubagentType;
    status: 'running' | 'completed' | 'failed' | 'stopped';
    createdAt: number;
    error?: string;
    reason?: string;
    background?: boolean;
  }>,
): ChatMessage[] {
  if (metas.length === 0) return messages;

  type Slot = { msgIdx: number; itemIdx: number; title: string; taskId: string };
  const slots: Slot[] = [];
  messages.forEach((m, msgIdx) => {
    m.timeline?.forEach((item, itemIdx) => {
      if (item.kind === 'subagent') {
        slots.push({ msgIdx, itemIdx, title: item.title, taskId: item.taskId });
      }
    });
  });

  const sorted = [...metas].sort((a, b) => a.createdAt - b.createdAt);
  const remaining = [...sorted];
  const next = messages.map((m) => ({
    ...m,
    timeline: m.timeline ? [...m.timeline] : undefined,
  }));

  const takeMeta = (slot: Slot) => {
    const byId = remaining.findIndex((m) => m.taskId === slot.taskId);
    if (byId >= 0) return remaining.splice(byId, 1)[0]!;
    const byTitle = remaining.findIndex((m) => m.title === slot.title);
    if (byTitle >= 0) return remaining.splice(byTitle, 1)[0]!;
    return remaining.shift();
  };

  for (const slot of slots) {
    const meta = takeMeta(slot);
    if (!meta) continue;
    const tl = next[slot.msgIdx]!.timeline;
    if (!tl) continue;
    const item = tl[slot.itemIdx];
    if (!item || item.kind !== 'subagent') continue;
    tl[slot.itemIdx] = {
      ...item,
      id: `subagent-${meta.taskId}`,
      taskId: meta.taskId,
      title: meta.title || item.title,
      subagentType: meta.subagentType ?? item.subagentType,
      status: meta.status,
      error: meta.error ?? item.error,
      reason: meta.reason ?? item.reason,
      background: meta.background ?? item.background,
    };
  }

  // 仅回填已有 Task→subagent 占位；无 slot 时丢弃未匹配 meta（不做挂尾兜底）
  return next;
}

export function messageHasTimelineContent(m: ChatMessage): boolean {
  return Boolean(m.content.trim() || (m.timeline && m.timeline.length > 0));
}
