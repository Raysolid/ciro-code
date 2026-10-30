import type { HarnessMode, PermissionPreset } from './primitives.js';

export { EXPLORE_TOOLS } from './subagent.js';

/** Phase 1 Ask 只读工具集 + bash（Policy 只读白名单） + WebFetch + Task(explore only) */
export const ASK_TOOLS = [
  'read',
  'list_files',
  'grep',
  'bash',
  'search_transcript',
  'get_tool_result',
  'SuggestMode',
  'WebFetch',
  'Task',
] as const;

/** Plan 确认前：Ask 工具 + 计划工具（Task 已在 ASK_TOOLS；verify/shell 由 Policy 放行） */
export const PLAN_EXTRA_TOOLS = [
  'AskQuestion',
  'CreatePlan',
  'UpdatePlan',
  'propose_plan',
] as const;

export const PLAN_TOOLS = [...ASK_TOOLS, ...PLAN_EXTRA_TOOLS] as const;

/** developer Profile 默认工具集（记忆写入走 write/edit） */
export const DEVELOPER_TOOLS = [
  'read',
  'list_files',
  'grep',
  'search_transcript',
  'get_tool_result',
  'write',
  'edit',
  'bash',
  'SuggestMode',
  'Task',
  'TodoWrite',
  'WebFetch',
] as const;

/** Debug：Agent 工具 + 仅清本 session debug log 的 delete_file（不含 Task） */
export const DEBUG_EXTRA_TOOLS = ['delete_file'] as const;
export const DEBUG_TOOLS = [
  'read',
  'list_files',
  'grep',
  'search_transcript',
  'get_tool_result',
  'write',
  'edit',
  'bash',
  'SuggestMode',
  'delete_file',
  'TodoWrite',
  'WebFetch',
] as const;

export type AskToolName = (typeof ASK_TOOLS)[number];
export type PlanToolName = (typeof PLAN_TOOLS)[number];
export type DeveloperToolName = (typeof DEVELOPER_TOOLS)[number];
export type DebugToolName = (typeof DEBUG_TOOLS)[number];

/**
 * Ask/Plan 硬拒的写工具（bash 走只读白名单，不在此列）。
 * shell 始终按 bash 同级处理（见 Policy）。
 */
export const ASK_DENIED_TOOLS = ['write', 'edit'] as const;

/** 各 mode 工具白名单 */
export const MODE_TOOL_WHITELIST: Record<HarnessMode, readonly string[]> = {
  ask: ASK_TOOLS,
  agent: DEVELOPER_TOOLS,
  plan: PLAN_TOOLS,
  debug: DEBUG_TOOLS,
};

/** preset → 允许的工具 */
export const PRESET_TOOL_WHITELIST: Record<PermissionPreset, readonly string[]> = {
  'workspace-readonly': ASK_TOOLS,
  'workspace-write': DEVELOPER_TOOLS,
  'plan-readonly': PLAN_TOOLS,
  'debug-instrument': DEBUG_TOOLS,
};

export function defaultPresetForMode(mode: HarnessMode): PermissionPreset {
  switch (mode) {
    case 'ask':
      return 'workspace-readonly';
    case 'plan':
      return 'plan-readonly';
    case 'debug':
      return 'debug-instrument';
    default:
      return 'workspace-write';
  }
}
