import type { HarnessMode, PermissionPreset } from './primitives.js';

export { EXPLORE_TOOLS } from './subagent.js';

/**
 * Kernel 工具全局稳定序（prompt-cache：公共前缀尽量对齐）。
 * MCP / extension 名不在此列，按字典序插在锚点之前。
 */
export const CANONICAL_TOOL_ORDER = [
  'read',
  'list_files',
  'grep',
  'bash',
  'search_transcript',
  'get_tool_result',
  'WebFetch',
  'write',
  'edit',
  'delete_file',
  'AskQuestion',
  'CreatePlan',
  'UpdatePlan',
  'propose_plan',
  'TodoWrite',
  'Task',
  'SuggestMode',
] as const;

/** Anthropic tools 断点锚：所有 mode envelope 均以此结尾 */
export const TOOL_CACHE_ANCHOR = 'SuggestMode' as const;

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

/** 各 mode 工具白名单（能力真相源；≠ schema 暴露 envelope） */
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

const CANONICAL_INDEX = new Map<string, number>(
  CANONICAL_TOOL_ORDER.map((name, i) => [name, i]),
);

/**
 * 将工具名按全局序排列：canonical 内核 → 其余字典序 → 末锚点固定在最后。
 * 未知锚点名时退化为纯稳定排序（锚点若在集合中仍置尾）。
 */
export function sortToolsForCache(names: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const n of names) {
    if (n) set.add(n);
  }
  const hasAnchor = set.delete(TOOL_CACHE_ANCHOR);
  const kernel: string[] = [];
  const rest: string[] = [];
  for (const n of set) {
    if (CANONICAL_INDEX.has(n)) kernel.push(n);
    else rest.push(n);
  }
  kernel.sort((a, b) => (CANONICAL_INDEX.get(a)! - CANONICAL_INDEX.get(b)!));
  rest.sort((a, b) => a.localeCompare(b));
  const out = [...kernel, ...rest];
  if (hasAnchor) out.push(TOOL_CACHE_ANCHOR);
  return out;
}

/**
 * 会话单调工具 envelope：只增不减，再按 cache 友好序排列。
 * `grew`：相对 previous 集合新增了工具名（冷启动 previous 为空时为 false）。
 */
export function mergeSessionToolEnvelope(
  previous: readonly string[] | undefined,
  nextParts: Iterable<string>,
): { envelope: string[]; grew: boolean } {
  const set = new Set<string>(previous ?? []);
  const before = set.size;
  for (const n of nextParts) {
    if (n) set.add(n);
  }
  return {
    envelope: sortToolsForCache(set),
    grew: previous !== undefined && previous.length > 0 && set.size > before,
  };
}
