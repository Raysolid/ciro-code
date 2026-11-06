import type { HarnessMode, PermissionPreset } from './primitives.js';
import { MODE_TOOL_WHITELIST, defaultPresetForMode } from './tools.js';

export type ModeId = HarnessMode;

export type ModePolicyPreset =
  | 'workspace-readonly'
  | 'workspace-full'
  | 'plan-readonly'
  | 'debug-instrument';

export type CompactionBias = 'aggressive' | 'normal' | 'retain-tool-results';

export type ModeUiPanel = 'plan' | 'debug' | 'diff';

/** 四模式配方契约（开源面）；产品文案由 Profile 包实现并注入 */
export interface ModeProfile {
  id: ModeId;
  /** 已解析的 system prompt 正文（base ⊕ mode delta，兼容展示） */
  systemPrompt: string;
  toolAllowlist: readonly string[];
  policyPreset: ModePolicyPreset;
  /** 映射到 PermissionPreset（PolicyEngine 使用） */
  permissionPreset: PermissionPreset;
  compactionBias: CompactionBias;
  ui: { panels: readonly ModeUiPanel[] };
}

/** Kernel 只依赖此端口；CLI / 装配层注入产品或 stub 实现 */
export interface ModeProfileProvider {
  getModeProfile(mode: HarnessMode): ModeProfile;
  /** base ⊕ mode delta（兼容 / 会计合计） */
  systemPromptForMode(mode: HarnessMode): string;
  /** 跨 mode 稳定核（不含 mode delta） */
  baseSystemPrompt(): string;
  /** 本 mode 专属 delta（ephemeral 注入） */
  modeDeltaForMode(mode: HarnessMode): string;
  toolsForMode(mode: HarnessMode): readonly string[];
}

const STUB_BASE =
  'You are Ciro Code (minimal stub). Shared rules apply in every mode.';

const STUB_DELTAS: Record<HarnessMode, string> = {
  ask: '# Ask mode\n\n**Ask mode is active.** Prefer read-only tools.',
  agent: '# Agent mode\n\n**Agent mode is active.** You may edit the workspace.',
  plan: '# Plan mode\n\n**Plan mode is active.** Produce a plan before large edits.',
  debug:
    '# Debug mode\n\n**Debug mode is active.** Ingest: {{DEBUG_INGEST_URL}}',
};

const STUB_POLICY: Record<HarnessMode, ModePolicyPreset> = {
  ask: 'workspace-readonly',
  agent: 'workspace-full',
  plan: 'plan-readonly',
  debug: 'debug-instrument',
};

const STUB_BIAS: Record<HarnessMode, CompactionBias> = {
  ask: 'aggressive',
  agent: 'normal',
  plan: 'normal',
  debug: 'retain-tool-results',
};

const STUB_PANELS: Record<HarnessMode, readonly ModeUiPanel[]> = {
  ask: [],
  agent: ['diff'],
  plan: ['plan'],
  debug: ['debug', 'diff'],
};

function stubProfile(mode: HarnessMode): ModeProfile {
  return {
    id: mode,
    systemPrompt: `${STUB_BASE}\n\n${STUB_DELTAS[mode]}`,
    toolAllowlist: MODE_TOOL_WHITELIST[mode],
    policyPreset: STUB_POLICY[mode],
    permissionPreset: defaultPresetForMode(mode),
    compactionBias: STUB_BIAS[mode],
    ui: { panels: STUB_PANELS[mode] },
  };
}

/** 公开仓 / 单测用 minimal Profile（非产品四模式文案） */
export function createMinimalModeProfiles(): ModeProfileProvider {
  const profiles: Record<HarnessMode, ModeProfile> = {
    ask: stubProfile('ask'),
    agent: stubProfile('agent'),
    plan: stubProfile('plan'),
    debug: stubProfile('debug'),
  };
  return {
    getModeProfile: (mode) => profiles[mode],
    systemPromptForMode: (mode) => profiles[mode].systemPrompt,
    baseSystemPrompt: () => STUB_BASE,
    modeDeltaForMode: (mode) => STUB_DELTAS[mode],
    toolsForMode: (mode) => profiles[mode].toolAllowlist,
  };
}
