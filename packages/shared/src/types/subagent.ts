/** Phase 4.3+ Subagent / Task 契约（kind 表为类型真源） */

import type { HarnessMode, PermissionPreset } from './primitives.js';

export const EXPLORE_TOOLS = [
  'read',
  'list_files',
  'grep',
  'bash',
  'SubmitExploreSummary',
] as const;
export type ExploreToolName = (typeof EXPLORE_TOOLS)[number];

/** Explore 终态提交工具名（与 EXPLORE_TOOLS 对齐） */
export const SUBMIT_EXPLORE_SUMMARY_TOOL = 'SubmitExploreSummary' as const;

export const EXPLORE_DISALLOWED_TOOLS = [
  'write',
  'edit',
  'Task',
  'SwitchMode',
  'CreatePlan',
  'SuggestMode',
  'AskQuestion',
  'UpdatePlan',
  'propose_plan',
  'delete_file',
  'TodoWrite',
  'WebFetch',
] as const;

/**
 * browser 基座工具（MCP 工具名在运行时按白名单注入）。
 * 无 write/edit/bash/Task/WebFetch。
 */
export const BROWSER_BASE_TOOLS = ['SubmitExploreSummary'] as const;

export type SubagentType = 'explore' | 'verify' | 'shell' | 'browser';

export type SubagentSystemKey = 'explore' | 'verify' | 'shell' | 'browser';

/** 子代理 kind：工具面 + Policy mode/preset；一种 kind = 一行 */
export interface SubagentKindSpec {
  tools: readonly string[];
  policyMode: HarnessMode;
  permissionPreset: PermissionPreset;
  systemKey: SubagentSystemKey;
}

export const SUBAGENT_KIND_TABLE: Record<SubagentType, SubagentKindSpec> = {
  explore: {
    tools: EXPLORE_TOOLS,
    policyMode: 'ask',
    permissionPreset: 'workspace-readonly',
    systemKey: 'explore',
  },
  verify: {
    tools: EXPLORE_TOOLS,
    /** agent：放开测 bash；write/edit/Task/WebFetch 仍由 subagentDepthDenyRule 硬拒 */
    policyMode: 'agent',
    permissionPreset: 'workspace-write',
    systemKey: 'verify',
  },
  shell: {
    tools: EXPLORE_TOOLS,
    /** 与父 Agent 同级 bash（危险/出站仍 enforce）；无 write/edit 工具 */
    policyMode: 'agent',
    permissionPreset: 'workspace-write',
    systemKey: 'shell',
  },
  browser: {
    tools: BROWSER_BASE_TOOLS,
    /** agent：可交互 MCP；无写盘工具；Ask/Plan 父会话硬拒 Task(browser) */
    policyMode: 'agent',
    permissionPreset: 'workspace-write',
    systemKey: 'browser',
  },
};

export function isSubagentType(value: string): value is SubagentType {
  return (
    value === 'explore' ||
    value === 'verify' ||
    value === 'shell' ||
    value === 'browser'
  );
}

export function getSubagentKind(type: SubagentType): SubagentKindSpec {
  return SUBAGENT_KIND_TABLE[type];
}

/** 卡片 / SSE 状态（禁止 queued / orphaned） */
export type SubagentRunStatus = 'running' | 'completed' | 'failed' | 'stopped';

export type SubagentStopReason =
  | 'timeout'
  | 'user'
  | 'parent_abort'
  | 'parent_error'
  | 'parent_deleted'
  | 'disconnected'
  | 'max_parallel';

/** summary_schema_v1 — 父 context 唯一入口 */
export interface SummarySchemaV1 {
  conclusion: string;
  paths: string[];
  symbols: string[];
  openQuestions: string[];
  confidence: 'high' | 'medium' | 'low';
}

export function isSummarySchemaV1(value: unknown): value is SummarySchemaV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.conclusion !== 'string' || !v.conclusion.trim()) return false;
  if (!Array.isArray(v.paths) || !v.paths.every((p) => typeof p === 'string')) return false;
  if (!Array.isArray(v.symbols) || !v.symbols.every((s) => typeof s === 'string')) return false;
  if (
    !Array.isArray(v.openQuestions) ||
    !v.openQuestions.every((q) => typeof q === 'string')
  ) {
    return false;
  }
  return v.confidence === 'high' || v.confidence === 'medium' || v.confidence === 'low';
}

export function parseSummarySchemaV1(raw: unknown): SummarySchemaV1 | null {
  if (typeof raw === 'string') {
    try {
      return parseSummarySchemaV1(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  return isSummarySchemaV1(raw) ? raw : null;
}

/** 子 run events.jsonl / 子 Tab SSE（不进父 timeline） */
export type SubagentRunEventType =
  | 'start'
  | 'progress'
  | 'thinking'
  | 'token'
  | 'tool_call_start'
  | 'tool_call_result'
  | 'completed'
  | 'stopped'
  | 'failed';

export interface SubagentRunEvent {
  type: SubagentRunEventType;
  ts?: number;
  title?: string;
  progressText?: string;
  text?: string;
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  resultPreview?: string;
  isError?: boolean;
  summary?: SummarySchemaV1;
  error?: string;
  reason?: SubagentStopReason;
}

export interface SubagentStartPayload {
  taskId: string;
  subagentType: SubagentType;
  title: string;
  status: 'running';
  parentSessionId: string;
  /** Task run_in_background：父不阻塞，UI 不展示「等待子代理」 */
  background?: boolean;
}

export interface SubagentProgressPayload {
  taskId: string;
  subagentType: SubagentType;
  status: 'running';
  progressText?: string;
  parentSessionId: string;
}

export interface SubagentCompletedPayload {
  taskId: string;
  subagentType: SubagentType;
  title: string;
  status: Exclude<SubagentRunStatus, 'running'>;
  parentSessionId: string;
  summary?: SummarySchemaV1;
  error?: string;
  reason?: SubagentStopReason;
}

/** 落盘 meta（父 sessionDir/subagents/<taskId>/meta.json） */
export interface SubagentRunMeta {
  taskId: string;
  parentSessionId: string;
  subagentType: SubagentType;
  title: string;
  prompt: string;
  status: SubagentRunStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  summary?: SummarySchemaV1;
  error?: string;
  reason?: SubagentStopReason;
  /** Task run_in_background */
  background?: boolean;
}

export interface SubagentsConfig {
  /** 同父并行 explore 上限；超限立即 error */
  maxParallel: number;
  /** 硬超时 ms */
  timeoutMs: number;
  /** 同父已终态 run 保留上限 */
  maxRetainedRuns: number;
  /** explore 模型：fast | inherit */
  exploreModel: 'fast' | 'inherit';
}

export const DEFAULT_SUBAGENTS_CONFIG: SubagentsConfig = {
  maxParallel: 3,
  timeoutMs: 10 * 60 * 1000,
  maxRetainedRuns: 20,
  /** Explore 默认继承父会话文本模型，避免落到 image-only default */
  exploreModel: 'inherit',
};
