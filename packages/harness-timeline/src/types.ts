import type {
  FileChangeRecord,
  FileEditOperation,
  HarnessMode,
  PlanQuestionAnswer,
  PlanQuestionItem,
  SubagentType,
} from '@ciro-code/harness-shared';

/** 对话时间线项（挂在 ChatMessage.timeline，按单 session / turn 消费） */
export type TimelineItem =
  | ThoughtTimelineItem
  | TextTimelineItem
  | ToolTimelineItem
  | DiffTimelineItem
  | WorkedTimelineItem
  | ModeSuggestTimelineItem
  | AskQuestionTimelineItem
  | PlanTimelineItem
  | SubagentTimelineItem
  | UserTimelineItem;

export interface ThoughtTimelineItem {
  kind: 'thought';
  id: string;
  text: string;
  /** 墙钟起点（ms） */
  startedAt: number;
  /** 定稿秒数；未定稿时 UI 用墙钟实时算 */
  durationSec?: number;
  ended?: boolean;
}

/** 可见 LLM 正文分段（可与 tool/thought 交错） */
export interface TextTimelineItem {
  kind: 'text';
  id: string;
  text: string;
  /** false/缺省 = 仍在流式追加；true = 已封闭 */
  ended?: boolean;
}

export interface ToolTimelineItem {
  kind: 'tool';
  id: string;
  toolName: string;
  status: 'running' | 'done' | 'error';
  toolInput?: Record<string, unknown>;
  preview?: string;
}

export interface DiffTimelineItem {
  kind: 'diff';
  id: string;
  path: string;
  operation: FileEditOperation;
  summary: string;
  unifiedDiff: string;
  truncated?: boolean;
  toolCallId?: string;
}

export interface WorkedTimelineItem {
  kind: 'worked';
  id: string;
  workedMs: number;
  stopped?: boolean;
}

/** Steer：插在当前助手时间线中，不另开一轮 sticky 用户气泡 */
export interface UserTimelineItem {
  kind: 'user';
  id: string;
  text: string;
  images?: Array<{
    mimeType: string;
    previewUrl?: string;
    path?: string;
  }>;
}

/** 同步式模式切换建议（对话内卡片，非 Composer 横幅） */
export interface ModeSuggestTimelineItem {
  kind: 'mode_suggest';
  id: string;
  suggestedMode: HarnessMode;
  currentMode: HarnessMode;
  reason: string;
  status: 'pending' | 'skipped' | 'switched';
  startedAt: number;
}

/** Plan AskQuestion：pending 时对话内只显示 Asking questions；结束后为摘要卡 */
export interface AskQuestionTimelineItem {
  kind: 'ask_question';
  id: string;
  questions: PlanQuestionItem[];
  status: 'pending' | 'answered' | 'skipped';
  answers?: PlanQuestionAnswer[];
}

/** CreatePlan / UpdatePlan 对话内计划卡片（对标 Cursor Created Plan） */
export interface PlanTimelineItem {
  kind: 'plan';
  id: string;
  planId: string;
  title: string;
  /** 卡片摘要（非全文 markdown） */
  overview: string;
  status: 'pending' | 'confirmed';
}

/** Phase 4.3 Task explore 无边框任务卡片 */
export interface SubagentTimelineItem {
  kind: 'subagent';
  id: string;
  taskId: string;
  title: string;
  subagentType: SubagentType;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  progressText?: string;
  reason?: string;
  error?: string;
  /** run_in_background：父不阻塞，不展示「等待子代理」 */
  background?: boolean;
}

export function diffItemFromChange(change: FileChangeRecord): DiffTimelineItem {
  return {
    kind: 'diff',
    id: `diff-${change.toolCallId ?? change.path}-${change.ts}`,
    path: change.path,
    operation: change.operation,
    summary: change.summary,
    unifiedDiff: change.unifiedDiff,
    truncated: change.truncated,
    toolCallId: change.toolCallId,
  };
}

/** Resume API 粗粒度 timeline（无 thought） */
export interface ResumeTimelineTool {
  kind: 'tool';
  id: string;
  toolName: string;
  status: 'done' | 'error';
  preview?: string;
  toolInput?: Record<string, unknown>;
}

export interface ResumeTimelineDiff {
  kind: 'diff';
  id: string;
  path: string;
  operation: FileEditOperation;
  summary: string;
  unifiedDiff: string;
  truncated?: boolean;
  toolCallId?: string;
}

export interface ResumeTimelineText {
  kind: 'text';
  id: string;
  text: string;
}

export interface ResumeTimelineThought {
  kind: 'thought';
  id: string;
  text: string;
  durationSec?: number;
}

export interface ResumeTimelineUser {
  kind: 'user';
  id: string;
  text: string;
  images?: Array<{ path: string; mimeType: string }>;
}

export type ResumeTimelineItem =
  | ResumeTimelineTool
  | ResumeTimelineDiff
  | ResumeTimelineText
  | ResumeTimelineThought
  | ResumeTimelineUser;

export const PLAN_TOOL_NAMES = new Set(['CreatePlan', 'UpdatePlan', 'propose_plan']);
/** 进度走 PlanPanel / plan_updated，不进时间线工具行或 Plan 卡 */
export const SILENT_TOOL_NAMES = new Set(['TodoWrite']);

const HARNESS_MODES = new Set<HarnessMode>(['ask', 'plan', 'agent', 'debug']);

function asHarnessMode(value: unknown, fallback: HarnessMode): HarnessMode {
  return typeof value === 'string' && HARNESS_MODES.has(value as HarnessMode)
    ? (value as HarnessMode)
    : fallback;
}

/** 从 CreatePlan 工具结果预览解析 planId */
export function planIdFromPreview(preview?: string): string | undefined {
  if (!preview) return undefined;
  const m = preview.match(/\bid=([^\s,)]+)/i);
  return m?.[1];
}

/** SuggestMode 工具结果预览 → 卡片终态 */
export function modeSuggestStatusFromPreview(
  preview?: string,
): ModeSuggestTimelineItem['status'] {
  if (!preview) return 'switched';
  if (/skipped switching|skipped switch/i.test(preview)) return 'skipped';
  if (/Already in\s+\w+\s+mode/i.test(preview)) return 'skipped';
  return 'switched';
}

export function modeSuggestCurrentFromPreview(
  preview: string | undefined,
  suggested: HarnessMode,
): HarnessMode {
  if (!preview) return suggested;
  const stay = preview.match(/Stay in\s+(\w+)/i);
  if (stay?.[1]) return asHarnessMode(stay[1], suggested);
  const already = preview.match(/Already in\s+(\w+)/i);
  if (already?.[1]) return asHarnessMode(already[1], suggested);
  return suggested;
}

/** 计划正文 → 卡片一行摘要 */
export function planCardOverview(markdown: string, max = 180): string {
  const plain = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) =>
      l
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim(),
    )
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1)}…`;
}

export function parseAskQuestionPreview(preview?: string): {
  skipped: boolean;
  answers?: PlanQuestionAnswer[];
} {
  if (!preview) return { skipped: false };
  if (preview.includes('[[plan_q:skip]]')) return { skipped: true };

  const mark = '[[plan_q]]';
  const at = preview.indexOf(mark);
  if (at >= 0) {
    const line = (preview.slice(at + mark.length).split('\n')[0] ?? '').trim();
    try {
      const parsed = JSON.parse(line) as { answers?: PlanQuestionAnswer[] };
      return { skipped: false, answers: parsed.answers };
    } catch {
      /* 旧会话可能把整段 {content,details} JSON 当 preview */
    }
  }

  if (!preview.trimStart().startsWith('{')) return { skipped: false };
  try {
    const obj = JSON.parse(preview) as {
      content?: Array<{ text?: string }>;
      details?: { skipped?: boolean; answers?: PlanQuestionAnswer[] };
    };
    if (obj.details?.skipped) return { skipped: true };
    if (obj.details?.answers?.length) return { skipped: false, answers: obj.details.answers };
    const text = obj.content?.map((c) => c.text ?? '').join('\n') ?? '';
    if (text && text !== preview) return parseAskQuestionPreview(text);
  } catch {
    /* ignore */
  }
  return { skipped: false };
}

export type MapResumeTimelineOpts = {
  confirmedPlanId?: string;
};

function mapResumeTool(item: ResumeTimelineTool, opts?: MapResumeTimelineOpts): TimelineItem {
  if (PLAN_TOOL_NAMES.has(item.toolName)) {
    const title =
      typeof item.toolInput?.title === 'string' && item.toolInput.title.trim()
        ? item.toolInput.title.trim()
        : item.toolName;
    const md = typeof item.toolInput?.plan === 'string' ? item.toolInput.plan : '';
    const planId = planIdFromPreview(item.preview) ?? item.id;
    return {
      kind: 'plan',
      id: `plan-${item.id}`,
      planId,
      title,
      overview: planCardOverview(md),
      status: opts?.confirmedPlanId && planId === opts.confirmedPlanId ? 'confirmed' : 'pending',
    };
  }
  if (item.toolName === 'SuggestMode') {
    const suggestedMode = asHarnessMode(item.toolInput?.suggestedMode, 'agent');
    const reason =
      typeof item.toolInput?.reason === 'string' ? item.toolInput.reason.trim() : '';
    return {
      kind: 'mode_suggest',
      id: item.id,
      suggestedMode,
      currentMode: modeSuggestCurrentFromPreview(item.preview, suggestedMode),
      reason: reason || `Switch to ${suggestedMode}`,
      status: modeSuggestStatusFromPreview(item.preview),
      startedAt: 0,
    };
  }
  if (item.toolName === 'Task') {
    const title =
      typeof item.toolInput?.title === 'string' && item.toolInput.title.trim()
        ? item.toolInput.title.trim()
        : typeof item.toolInput?.subagent_type === 'string'
          ? item.toolInput.subagent_type
          : 'Explore';
    const subagentType: SubagentType =
      item.toolInput?.subagent_type === 'verify' ? 'verify' : 'explore';
    return {
      kind: 'subagent',
      id: `subagent-${item.id}`,
      /** 占位：resume 后由 meta 按序回填真实 taskId */
      taskId: item.id,
      title,
      subagentType,
      status: item.status === 'error' ? 'failed' : 'completed',
    };
  }
  if (item.toolName === 'AskQuestion') {
    const raw = item.toolInput?.questions;
    const questions = Array.isArray(raw) ? (raw as PlanQuestionItem[]) : [];
    const parsed = parseAskQuestionPreview(item.preview);
    return {
      kind: 'ask_question',
      id: item.id,
      questions,
      status: parsed.skipped ? 'skipped' : 'answered',
      answers: parsed.answers,
    };
  }
  return {
    kind: 'tool',
    id: item.id,
    toolName: item.toolName,
    status: item.status,
    preview: item.preview,
    toolInput: item.toolInput,
  };
}

export function mapResumeTimeline(
  items?: ResumeTimelineItem[],
  opts?: MapResumeTimelineOpts,
): TimelineItem[] | undefined {
  if (!items?.length) return undefined;
  return items.flatMap((item) => {
    if (item.kind === 'tool' && SILENT_TOOL_NAMES.has(item.toolName)) return [];
    if (item.kind === 'tool') return [mapResumeTool(item, opts)];
    if (item.kind === 'text') {
      return [
        {
          kind: 'text' as const,
          id: item.id,
          text: item.text,
          ended: true,
        },
      ];
    }
    if (item.kind === 'thought') {
      return [
        {
          kind: 'thought' as const,
          id: item.id,
          text: item.text,
          startedAt: 0,
          durationSec: item.durationSec,
          ended: true,
        },
      ];
    }
    if (item.kind === 'user') {
      return [
        {
          kind: 'user' as const,
          id: item.id,
          text: item.text,
          images: item.images?.map((img) => ({
            mimeType: img.mimeType,
            path: img.path,
          })),
        },
      ];
    }
    return [
      {
        kind: 'diff' as const,
        id: item.id,
        path: item.path,
        operation: item.operation,
        summary: item.summary,
        unifiedDiff: item.unifiedDiff,
        truncated: item.truncated,
        toolCallId: item.toolCallId,
      },
    ];
  });
}
