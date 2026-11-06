import {
  ASK_TOOLS,
  DEBUG_TOOLS,
  DEVELOPER_TOOLS,
  PLAN_TOOLS,
  type HarnessMode,
  type ModeProfile,
  type ModeProfileProvider,
} from '@ciro-code/harness-shared';
import {
  loadBaseSystemPrompt,
  loadModeDeltaPrompt,
  loadModeSystemPrompt,
} from './load-prompt.js';

function buildProfiles(): Record<HarnessMode, ModeProfile> {
  return {
    ask: {
      id: 'ask',
      systemPrompt: loadModeSystemPrompt('ask'),
      toolAllowlist: ASK_TOOLS,
      policyPreset: 'workspace-readonly',
      permissionPreset: 'workspace-readonly',
      compactionBias: 'aggressive',
      ui: { panels: [] },
    },
    agent: {
      id: 'agent',
      systemPrompt: loadModeSystemPrompt('agent'),
      toolAllowlist: DEVELOPER_TOOLS,
      policyPreset: 'workspace-full',
      permissionPreset: 'workspace-write',
      compactionBias: 'normal',
      ui: { panels: ['diff'] },
    },
    plan: {
      id: 'plan',
      systemPrompt: loadModeSystemPrompt('plan'),
      toolAllowlist: PLAN_TOOLS,
      policyPreset: 'plan-readonly',
      permissionPreset: 'plan-readonly',
      compactionBias: 'normal',
      ui: { panels: ['plan'] },
    },
    debug: {
      id: 'debug',
      systemPrompt: loadModeSystemPrompt('debug'),
      toolAllowlist: DEBUG_TOOLS,
      policyPreset: 'debug-instrument',
      permissionPreset: 'debug-instrument',
      compactionBias: 'retain-tool-results',
      ui: { panels: ['debug', 'diff'] },
    },
  };
}

let cached: Record<HarnessMode, ModeProfile> | null = null;
let cachedBase: string | null = null;

/** 获取四模式 Profile（懒加载并缓存 embed 正文） */
export function getModeProfiles(): Record<HarnessMode, ModeProfile> {
  if (!cached) cached = buildProfiles();
  return cached;
}

export function getModeProfile(mode: HarnessMode): ModeProfile {
  return getModeProfiles()[mode];
}

export function systemPromptForMode(mode: HarnessMode): string {
  return getModeProfile(mode).systemPrompt;
}

export function baseSystemPrompt(): string {
  if (!cachedBase) cachedBase = loadBaseSystemPrompt();
  return cachedBase;
}

export function modeDeltaForMode(mode: HarnessMode): string {
  return loadModeDeltaPrompt(mode);
}

export function toolsForMode(mode: HarnessMode): readonly string[] {
  return getModeProfile(mode).toolAllowlist;
}

/** 测试或热更新后清空缓存 */
export function resetModeProfileCache(): void {
  cached = null;
  cachedBase = null;
}

/** 供 CLI / 装配层注入 Kernel（ModeProfileProvider 端口） */
export function createModeProfileProvider(): ModeProfileProvider {
  return {
    getModeProfile,
    systemPromptForMode,
    baseSystemPrompt,
    modeDeltaForMode,
    toolsForMode,
  };
}
