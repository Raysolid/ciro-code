import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  ASK_TOOLS,
  DEFAULT_COMPACTION_CONFIG,
  DEFAULT_HOST,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_MODEL_CONTEXT_LIMIT,
  DEFAULT_PORT,
  DEFAULT_RESERVED_OUTPUT_TOKENS,
  DEFAULT_SESSION_CONFIG,
  DEFAULT_SKILL_CONFIG,
  DEFAULT_SUBAGENTS_CONFIG,
  DEFAULT_UI_CONFIG,
  DEVELOPER_TOOLS,
  defaultPresetForMode,
  type AgentBackend,
  type CompactionConfig,
  type CompactionMode,
  type HarnessConfig,
  type HarnessMode,
  type MemoryConfig,
  type PermissionPreset,
  type SessionPersistConfig,
  type SkillConfig,
  type SubagentsConfig,
  type UiConfig,
} from '@ciro/harness-shared';
import {
  globalConfigPath,
  legacyGlobalConfigPath,
  legacyPathWarning,
  legacyProjectConfigPath,
  projectConfigPath,
  resolveReadable,
} from '../paths/product-paths.js';
import { loadProfileOverlay, type ProfileRaw } from './load-profile.js';

export interface LoadConfigOptions {
  workspace?: string;
  mode?: HarnessMode;
  agentBackend?: AgentBackend;
  port?: number;
  host?: string;
  /** Profile overlay id（`--profile=`）；default ← global ← profile ← project ← cli */
  profile?: string;
}

export type ConfigSource = 'default' | 'global' | 'profile' | 'project' | 'cli' | 'env';

export interface ConfigFieldSource {
  mode: ConfigSource;
  tools: ConfigSource;
  llm: ConfigSource;
  permissions: ConfigSource;
  bind: ConfigSource;
  agentBackend: ConfigSource;
  memory: ConfigSource;
  compaction: ConfigSource;
  session: ConfigSource;
  skill: ConfigSource;
  ui: ConfigSource;
  subagents: ConfigSource;
}

export interface EffectiveConfig {
  config: HarnessConfig;
  sources: ConfigFieldSource;
  paths: {
    global?: string;
    project?: string;
    /** 选用了旧 `.pi` 项目配置时记录 */
    projectLegacy?: string;
    profile?: string;
  };
  /** 生效的 profile id（若有） */
  profileId?: string;
  warnings: string[];
}

interface RawConfig {
  llm?: { provider?: string; model?: string };
  mode?: string;
  tools?: string[];
  permissions?: { preset?: string };
  memory?: Partial<MemoryConfig>;
  compaction?: Partial<CompactionConfig> & {
    thresholds?: Partial<CompactionConfig['thresholds']>;
  };
  session?: Partial<SessionPersistConfig>;
  skill?: Partial<SkillConfig>;
  ui?: Partial<UiConfig> & {
    contextUsage?: Partial<UiConfig['contextUsage']>;
  };
  modelContextLimit?: number;
  reservedOutputTokens?: number;
  subagents?: Partial<SubagentsConfig>;
}

function readYamlFile(path: string): RawConfig {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf-8');
    return (parseYaml(raw) as RawConfig) ?? {};
  } catch {
    return {};
  }
}

function readGlobalConfig(): {
  raw: RawConfig;
  path?: string;
  warnings: string[];
} {
  const primary = globalConfigPath();
  const legacy = legacyGlobalConfigPath();
  const resolved = resolveReadable(primary, legacy);
  const warnings: string[] = [];
  if (resolved.fromLegacy) {
    warnings.push(legacyPathWarning('global config', legacy));
    console.warn(`[ciro] ${warnings[0]}`);
  }
  if (!existsSync(resolved.path)) return { raw: {}, warnings };
  return { raw: readYamlFile(resolved.path), path: resolved.path, warnings };
}

function readProjectConfig(workspace: string): {
  raw: RawConfig;
  path?: string;
  legacyPath?: string;
  warnings: string[];
} {
  const primary = projectConfigPath(workspace);
  const legacy = legacyProjectConfigPath(workspace);
  const resolved = resolveReadable(primary, legacy);
  const warnings: string[] = [];

  if (!existsSync(resolved.path)) {
    return { raw: {}, warnings };
  }

  if (resolved.fromLegacy) {
    warnings.push(legacyPathWarning('project config', legacy));
    console.warn(`[ciro] ${warnings[0]}`);
    return {
      raw: readYamlFile(resolved.path),
      path: resolved.path,
      legacyPath: legacy,
      warnings,
    };
  }

  return { raw: readYamlFile(resolved.path), path: resolved.path, warnings };
}

function resolveProvider(
  project: RawConfig,
  global: RawConfig,
): { llm: HarnessConfig['llm']; source: ConfigSource } {
  const merged = {
    provider: project.llm?.provider ?? global.llm?.provider,
    model: project.llm?.model ?? global.llm?.model,
  };
  const source: ConfigSource = project.llm ? 'project' : global.llm ? 'global' : 'env';
  const provider = (merged.provider ?? 'env') as HarnessConfig['llm']['provider'];
  const model = merged.model ?? process.env.CIRO_MODEL ?? 'deepseek-chat';
  return { llm: { provider, model }, source };
}

function defaultToolsForMode(mode: HarnessMode): string[] {
  return mode === 'ask' || mode === 'plan' ? [...ASK_TOOLS] : [...DEVELOPER_TOOLS];
}

function parseMode(value: string | undefined): HarnessMode | undefined {
  if (value === 'ask' || value === 'agent' || value === 'plan' || value === 'debug') {
    return value;
  }
  return undefined;
}

function parsePreset(value: string | undefined): PermissionPreset | undefined {
  if (
    value === 'workspace-readonly' ||
    value === 'workspace-write' ||
    value === 'plan-readonly' ||
    value === 'debug-instrument'
  ) {
    return value;
  }
  return undefined;
}

function parseCompactionMode(value: string | undefined): CompactionMode | undefined {
  if (value === 'auto' || value === 'ask' || value === 'manual') return value;
  return undefined;
}

function pickLayer<T>(
  projectVal: T | undefined,
  profileVal: T | undefined,
  globalVal: T | undefined,
): { value: T | undefined; source: ConfigSource } {
  if (projectVal !== undefined) return { value: projectVal, source: 'project' };
  if (profileVal !== undefined) return { value: profileVal, source: 'profile' };
  if (globalVal !== undefined) return { value: globalVal, source: 'global' };
  return { value: undefined, source: 'default' };
}

function mergeMemory(
  project: RawConfig,
  profile: ProfileRaw,
  global: RawConfig,
): {
  memory: MemoryConfig;
  source: ConfigSource;
} {
  const { value, source } = pickLayer(project.memory, profile.memory, global.memory);
  if (!value) return { memory: { ...DEFAULT_MEMORY_CONFIG }, source: 'default' };
  return {
    memory: {
      ...DEFAULT_MEMORY_CONFIG,
      ...value,
      enableEmbedding: value.enableEmbedding ?? DEFAULT_MEMORY_CONFIG.enableEmbedding,
      maxMemoryFiles: value.maxMemoryFiles ?? DEFAULT_MEMORY_CONFIG.maxMemoryFiles,
    },
    source,
  };
}

function mergeCompaction(project: RawConfig, global: RawConfig): {
  compaction: CompactionConfig;
  source: ConfigSource;
} {
  const { value, source } = pickLayer(project.compaction, undefined, global.compaction);
  if (!value) return { compaction: structuredClone(DEFAULT_COMPACTION_CONFIG), source: 'default' };
  const mode = parseCompactionMode(value.mode as string | undefined) ?? DEFAULT_COMPACTION_CONFIG.mode;
  return {
    compaction: {
      ...DEFAULT_COMPACTION_CONFIG,
      ...value,
      mode,
      thresholds: {
        ...DEFAULT_COMPACTION_CONFIG.thresholds,
        ...value.thresholds,
      },
      strategies: value.strategies ?? DEFAULT_COMPACTION_CONFIG.strategies,
    },
    source,
  };
}

function mergeSession(project: RawConfig, global: RawConfig): {
  session: SessionPersistConfig;
  source: ConfigSource;
} {
  const { value, source } = pickLayer(project.session, undefined, global.session);
  if (!value) return { session: { ...DEFAULT_SESSION_CONFIG }, source: 'default' };
  return {
    session: {
      ...DEFAULT_SESSION_CONFIG,
      ...value,
      eventFormat: 'jsonl',
    },
    source,
  };
}

function mergeSkill(
  project: RawConfig,
  profile: ProfileRaw,
  global: RawConfig,
): {
  skill: SkillConfig;
  source: ConfigSource;
} {
  const { value, source } = pickLayer(project.skill, profile.skill, global.skill);
  if (!value) return { skill: { ...DEFAULT_SKILL_CONFIG }, source: 'default' };
  return {
    skill: {
      ...DEFAULT_SKILL_CONFIG,
      ...value,
    },
    source,
  };
}

function mergeUi(project: RawConfig, global: RawConfig): {
  ui: UiConfig;
  source: ConfigSource;
} {
  const { value, source } = pickLayer(project.ui, undefined, global.ui);
  if (!value) return { ui: structuredClone(DEFAULT_UI_CONFIG), source: 'default' };
  return {
    ui: {
      priority: value.priority ?? DEFAULT_UI_CONFIG.priority,
      contextUsage: {
        ...DEFAULT_UI_CONFIG.contextUsage,
        ...value.contextUsage,
      },
    },
    source,
  };
}

function mergeSubagents(project: RawConfig, global: RawConfig): {
  subagents: SubagentsConfig;
  source: ConfigSource;
} {
  const { value, source } = pickLayer(project.subagents, undefined, global.subagents);
  if (!value) return { subagents: { ...DEFAULT_SUBAGENTS_CONFIG }, source: 'default' };
  return {
    subagents: {
      ...DEFAULT_SUBAGENTS_CONFIG,
      ...value,
    },
    source,
  };
}

/** Phase 2+ merge：default ← global ← profile ← project ← CLI */
export function loadEffectiveConfig(options: LoadConfigOptions = {}): EffectiveConfig {
  const workspace = options.workspace ?? process.cwd();
  const globalCfg = readGlobalConfig();
  const global = globalCfg.raw;
  const project = readProjectConfig(workspace);
  const warnings = [...globalCfg.warnings, ...project.warnings];

  let profileRaw: ProfileRaw = {};
  let profilePath: string | undefined;
  let profileId: string | undefined;
  if (options.profile?.trim()) {
    const loaded = loadProfileOverlay(options.profile.trim());
    profileRaw = loaded.raw;
    profilePath = loaded.path;
    profileId = loaded.id;
  }

  const sources: ConfigFieldSource = {
    mode: 'default',
    tools: 'default',
    llm: 'env',
    permissions: 'default',
    bind: 'default',
    agentBackend: 'default',
    memory: 'default',
    compaction: 'default',
    session: 'default',
    skill: 'default',
    ui: 'default',
    subagents: 'default',
  };

  let mode: HarnessMode = 'ask';
  if (parseMode(global.mode)) {
    mode = parseMode(global.mode)!;
    sources.mode = 'global';
  }
  if (parseMode(profileRaw.mode)) {
    mode = parseMode(profileRaw.mode)!;
    sources.mode = 'profile';
  }
  if (parseMode(project.raw.mode)) {
    mode = parseMode(project.raw.mode)!;
    sources.mode = 'project';
  }
  if (options.mode) {
    mode = options.mode;
    sources.mode = 'cli';
  }

  let tools = defaultToolsForMode(mode);
  if (global.tools) {
    tools = global.tools;
    sources.tools = 'global';
  }
  if (profileRaw.tools) {
    tools = profileRaw.tools;
    sources.tools = 'profile';
  }
  if (project.raw.tools) {
    tools = project.raw.tools;
    sources.tools = 'project';
  }

  const { llm, source: llmSource } = resolveProvider(project.raw, global);
  sources.llm = llmSource;

  let preset: PermissionPreset | undefined;
  if (parsePreset(global.permissions?.preset)) {
    preset = parsePreset(global.permissions?.preset);
    sources.permissions = 'global';
  }
  if (parsePreset(profileRaw.permissions?.preset)) {
    preset = parsePreset(profileRaw.permissions?.preset);
    sources.permissions = 'profile';
  }
  if (parsePreset(project.raw.permissions?.preset)) {
    preset = parsePreset(project.raw.permissions?.preset);
    sources.permissions = 'project';
  }

  let agentBackend: AgentBackend = 'pi';
  if (options.agentBackend) {
    agentBackend = options.agentBackend;
    sources.agentBackend = 'cli';
  }

  const bind = {
    host: options.host ?? DEFAULT_HOST,
    port: options.port ?? DEFAULT_PORT,
  };
  if (options.host != null || options.port != null) {
    sources.bind = 'cli';
  }

  const { memory, source: memorySource } = mergeMemory(project.raw, profileRaw, global);
  sources.memory = memorySource;
  const { compaction, source: compactionSource } = mergeCompaction(project.raw, global);
  sources.compaction = compactionSource;
  const { session, source: sessionSource } = mergeSession(project.raw, global);
  sources.session = sessionSource;
  const { skill, source: skillSource } = mergeSkill(project.raw, profileRaw, global);
  sources.skill = skillSource;
  const { ui, source: uiSource } = mergeUi(project.raw, global);
  sources.ui = uiSource;
  const { subagents, source: subagentsSource } = mergeSubagents(project.raw, global);
  sources.subagents = subagentsSource;

  const modelContextLimit =
    project.raw.modelContextLimit ??
    global.modelContextLimit ??
    DEFAULT_MODEL_CONTEXT_LIMIT;
  const reservedOutputTokens =
    project.raw.reservedOutputTokens ??
    global.reservedOutputTokens ??
    DEFAULT_RESERVED_OUTPUT_TOKENS;

  const effectivePreset = preset ?? defaultPresetForMode(mode);
  if (mode === 'ask' && effectivePreset === 'workspace-write') {
    warnings.push('Ask mode with workspace-write preset is unusual; write tools still denied by Ask rules');
  }

  if (compaction.thresholds.background >= compaction.thresholds.suggest) {
    warnings.push('compaction.thresholds.background should be < suggest');
  }
  if (compaction.thresholds.suggest >= compaction.thresholds.required) {
    warnings.push('compaction.thresholds.suggest should be < required');
  }

  const config: HarnessConfig = {
    workspace,
    mode,
    agentBackend,
    llm,
    tools,
    // 仅在配置文件显式声明时固化 preset；否则运行时按 mode 推导
    permissions: preset ? { preset } : undefined,
    bind,
    memory,
    compaction,
    session,
    skill,
    ui,
    subagents,
    modelContextLimit,
    reservedOutputTokens,
  };

  return {
    config,
    sources,
    profileId,
    paths: {
      global: globalCfg.path,
      project: project.path,
      projectLegacy: project.legacyPath,
      profile: profilePath,
    },
    warnings,
  };
}

export function loadConfig(options: LoadConfigOptions = {}): HarnessConfig {
  return loadEffectiveConfig(options).config;
}

export function validateConfig(effective: EffectiveConfig): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings = [...effective.warnings];
  const { config } = effective;

  if (!config.workspace) errors.push('workspace is required');
  if (!['ask', 'agent', 'plan', 'debug'].includes(config.mode)) {
    errors.push(`invalid mode: ${config.mode}`);
  }
  if (!Array.isArray(config.tools) || config.tools.length === 0) {
    warnings.push('tools list is empty');
  }
  if (config.llm.provider === 'env' && !hasApiKey()) {
    warnings.push('No API key in env (DEEPSEEK_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)');
  }
  if (!['auto', 'ask', 'manual'].includes(config.compaction.mode)) {
    errors.push(`invalid compaction.mode: ${config.compaction.mode}`);
  }
  if (config.skill.maxInjectTokens <= 0) {
    errors.push('skill.maxInjectTokens must be > 0');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function hasApiKey(): boolean {
  return Boolean(
    process.env.DEEPSEEK_API_KEY ??
      process.env.OPENAI_API_KEY ??
      process.env.ANTHROPIC_API_KEY,
  );
}
