import {
  isPlanBuildUserMessage,
  planTitleFromBuildMessage,
  type HarnessMode,
} from '@ciro-code/harness-shared';

import { mapResumeTimeline, type ResumeTimelineItem, type TimelineItem } from './types.js';

/** 时间线中的压缩边界（持久化，resume 可见） */
export interface CompactionMarkerMeta {
  method?: string;
  tokensSaved?: number;
  narrative?: string;
}

/** UI 会话消息（resume / stream 组装用，非 shared 契约） */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'compaction';
  content: string;
  status: 'pending' | 'streaming' | 'completed' | 'error';
  /** 本 turn 时间线（thought / text / tool / diff / worked） */
  timeline?: TimelineItem[];
  workedMs?: number;
  /** 本轮流式开始墙钟（ms），用于「已用时」实时计数 */
  streamStartedAt?: number;
  /** 本轮开始时的 mode（完成 footer） */
  turnMode?: HarnessMode;
  /** 本轮模型展示名（完成 footer） */
  turnModelLabel?: string;
  /** 用户消息图片：本地预览 URL 或 resume 附件 path */
  images?: Array<{
    mimeType: string;
    previewUrl?: string;
    path?: string;
  }>;
  /** Confirm/Build 注入的实现回合；时间线渲染 Build 卡 */
  origin?: 'plan_build';
  planTitle?: string;
  /** role=compaction 时的元数据 */
  compaction?: CompactionMarkerMeta;
}

/** 服务端 resume / rewind / fork / attach_snapshot 消息 → UI ChatMessage */
export type ResumeServerMessage = {
  id: string;
  role: 'user' | 'assistant' | 'compaction';
  content: string;
  timeline?: ResumeTimelineItem[];
  workedMs?: number;
  images?: Array<{ path: string; mimeType: string }>;
  compaction?: CompactionMarkerMeta;
};

export function mapResumeServerMessage(
  m: ResumeServerMessage,
  opts?: { confirmedPlanId?: string },
): ChatMessage {
  if (m.role === 'compaction') {
    return {
      id: m.id,
      role: 'compaction',
      content: m.content ?? '',
      status: 'completed',
      compaction: m.compaction ?? {
        narrative: m.content || undefined,
      },
    };
  }
  const timeline = mapResumeTimeline(m.timeline, opts);
  const workedMs =
    typeof m.workedMs === 'number' && m.workedMs > 0 ? m.workedMs : undefined;
  const planTitle =
    m.role === 'user' ? planTitleFromBuildMessage(m.content) : undefined;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    status: 'completed',
    timeline,
    workedMs,
    images: m.images?.map((img) => ({
      mimeType: img.mimeType,
      path: img.path,
    })),
    ...(m.role === 'user' && isPlanBuildUserMessage(m.content)
      ? { origin: 'plan_build' as const, ...(planTitle ? { planTitle } : {}) }
      : {}),
  };
}

/** micro 过密，时间线只展示 SM / full（及未知 method） */
export function shouldPersistCompactionMarker(method?: string): boolean {
  if (!method) return true;
  return method !== 'micro';
}

export function createCompactionChatMessage(opts: {
  id?: string;
  method?: string;
  tokensSaved?: number;
  narrative?: string;
  ts?: number;
}): ChatMessage {
  const ts = opts.ts ?? Date.now();
  return {
    id: opts.id ?? `compaction-${ts}`,
    role: 'compaction',
    content: opts.narrative ?? '',
    status: 'completed',
    compaction: {
      method: opts.method,
      tokensSaved: opts.tokensSaved,
      narrative: opts.narrative,
    },
  };
}
