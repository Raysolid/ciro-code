/** SSE 信封 — 与 ciro-chat frontend/src/types/chat.ts 对齐 */
export interface SseEnvelope<T = unknown> {
  type: string;
  ts: number;
  conversationId?: string;
  messageId?: string;
  payload: T;
  /** O3：TurnHub 缓冲下标；缺省兼容旧客户端 */
  seq?: number;
}

export type HarnessMode = 'ask' | 'plan' | 'agent' | 'debug';

export type AgentBackend = 'pi' | 'mock';

export type PermissionPreset =
  | 'workspace-readonly'
  | 'workspace-write'
  | 'plan-readonly'
  | 'debug-instrument';

export type CompactionMode = 'auto' | 'ask' | 'manual';

export type ContextBucketId =
  | 'system'
  | 'tools'
  | 'memory'
  | 'rules'
  | 'skills'
  | 'conversation'
  | 'summarized'
  | 'mcp'
  | 'subagents';

export type ContextUrgency = 'none' | 'background' | 'suggest' | 'required';

/** Phase 3：session / 全局默认模型引用（与 Mode 正交） */
export interface ModelRef {
  providerId: string;
  modelId: string;
}

/** 对齐 Pi ThinkingLevel 字面量（Pi setThinkingLevel 可接受全集） */
export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

/** 菜单可选档：OpenAI 兼容拉模 API 不返回 thinking levels，固定四档 */
export type MenuThinkingLevel = 'low' | 'medium' | 'high' | 'max';

export const MENU_THINKING_LEVELS: readonly MenuThinkingLevel[] = [
  'low',
  'medium',
  'high',
  'max',
] as const;

export const DEFAULT_THINKING_LEVEL: MenuThinkingLevel = 'medium';

/** 将任意 ThinkingLevel 归一到菜单四档 */
export function toMenuThinkingLevel(level: ThinkingLevel | undefined): MenuThinkingLevel {
  if (level === 'low' || level === 'medium' || level === 'high' || level === 'max') {
    return level;
  }
  if (level === 'minimal') return 'low';
  if (level === 'xhigh') return 'high';
  return DEFAULT_THINKING_LEVEL;
}
