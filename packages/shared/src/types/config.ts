import type {
  AgentBackend,
  CompactionMode,
  ContextBucketId,
  HarnessMode,
  PermissionPreset,
} from './primitives.js';
import { ASK_TOOLS } from './tools.js';
import {
  DEFAULT_SUBAGENTS_CONFIG,
  type SubagentsConfig,
} from './subagent.js';

export type { SubagentsConfig } from './subagent.js';
export { DEFAULT_SUBAGENTS_CONFIG } from './subagent.js';

export interface MemoryConfig {
  storage: 'file' | 'hybrid';
  indexing: 'bm25' | 'embedding' | 'hybrid';
  enableEmbedding: boolean;
  maxMemoryFiles: number;
}

export interface CompactionConfig {
  mode: CompactionMode;
  thresholds: {
    background: number;
    suggest: number;
    required: number;
  };
  maxConsecutiveFailures: number;
}

export interface SessionPersistConfig {
  eventFormat: 'jsonl';
  snapshotInterval: number;
  autoRecover: boolean;
}

export interface SkillConfig {
  maxInjectTokens: number;
  autoActivateByKeyword: boolean;
  autoActivateByMode: boolean;
  enableSkillTool: boolean;
}

export interface ContextUsageUiConfig {
  enabled: boolean;
  style: 'popover' | 'inline-bar';
  showActions: boolean;
}

export interface UiConfig {
  priority: string[];
  contextUsage: ContextUsageUiConfig;
}

export interface HarnessConfig {
  workspace: string;
  mode: HarnessMode;
  agentBackend: AgentBackend;
  llm: {
    provider: 'env' | 'openai' | 'deepseek';
    model?: string;
  };
  tools: string[];
  permissions?: {
    preset?: PermissionPreset;
  };
  bind: {
    host: string;
    port: number;
  };
  memory: MemoryConfig;
  compaction: CompactionConfig;
  session: SessionPersistConfig;
  skill: SkillConfig;
  ui: UiConfig;
  /** Phase 4.3 Task / explore */
  subagents: SubagentsConfig;
  /** 模型上下文窗口（token）；ContextAccountant 用 */
  modelContextLimit: number;
  reservedOutputTokens: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  storage: 'file',
  indexing: 'bm25',
  enableEmbedding: false,
  maxMemoryFiles: 50,
};

/** 轻量优先、逐步升级：micro 早触发；full 提前到 85% 给摘要留生成余量 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  mode: 'auto',
  thresholds: {
    background: 0.65,
    suggest: 0.8,
    required: 0.85,
  },
  maxConsecutiveFailures: 3,
};

export const DEFAULT_SESSION_CONFIG: SessionPersistConfig = {
  eventFormat: 'jsonl',
  snapshotInterval: 500,
  autoRecover: true,
};

export const DEFAULT_SKILL_CONFIG: SkillConfig = {
  maxInjectTokens: 8000,
  autoActivateByKeyword: true,
  autoActivateByMode: true,
  enableSkillTool: false,
};

export const DEFAULT_UI_CONFIG: UiConfig = {
  priority: ['sessions', 'memory', 'fileTree', 'contextUsage', 'config'],
  contextUsage: {
    enabled: true,
    style: 'popover',
    showActions: true,
  },
};

export const DEFAULT_MODEL_CONTEXT_LIMIT = 128_000;
export const DEFAULT_RESERVED_OUTPUT_TOKENS = 4096;

export const DEFAULT_PORT = 3080;
export const DEFAULT_HOST = '127.0.0.1';

export const HARNESS_VERSION = '0.1.0';

/** Skill 注入 token 预算（默认与 skill.maxInjectTokens 对齐） */
export const MAX_INJECT_TOKENS = 8000;

/** Rules 常驻注入截断上限（独立于 Skill 预算） */
export const MAX_RULES_TOKENS = 4000;

export const CONTEXT_BUCKET_LABELS: Record<ContextBucketId, string> = {
  system: 'System',
  tools: 'Tools',
  memory: 'Memory',
  rules: 'Rules',
  skills: 'Skills',
  conversation: 'Conversation',
  summarized: 'Summarized',
  mcp: 'MCP',
  subagents: 'Subagents',
};

function cloneCompaction(base: CompactionConfig): CompactionConfig {
  return {
    ...base,
    thresholds: { ...base.thresholds },
  };
}

function cloneUi(base: UiConfig): UiConfig {
  return {
    priority: [...base.priority],
    contextUsage: { ...base.contextUsage },
  };
}

/** 测试 / 手写配置补齐 Phase 2 默认字段 */
export function createHarnessConfig(
  partial: Partial<HarnessConfig> & Pick<HarnessConfig, 'workspace'>,
): HarnessConfig {
  return {
    workspace: partial.workspace,
    mode: partial.mode ?? 'ask',
    agentBackend: partial.agentBackend ?? 'mock',
    llm: partial.llm ?? { provider: 'env' },
    tools: partial.tools ?? [...ASK_TOOLS],
    permissions: partial.permissions,
    bind: partial.bind ?? { host: DEFAULT_HOST, port: DEFAULT_PORT },
    memory: { ...DEFAULT_MEMORY_CONFIG, ...partial.memory },
    compaction: {
      ...cloneCompaction(DEFAULT_COMPACTION_CONFIG),
      ...partial.compaction,
      thresholds: {
        ...DEFAULT_COMPACTION_CONFIG.thresholds,
        ...partial.compaction?.thresholds,
      },
      maxConsecutiveFailures:
        partial.compaction?.maxConsecutiveFailures ??
        DEFAULT_COMPACTION_CONFIG.maxConsecutiveFailures,
    },
    session: { ...DEFAULT_SESSION_CONFIG, ...partial.session },
    skill: { ...DEFAULT_SKILL_CONFIG, ...partial.skill },
    ui: {
      ...cloneUi(DEFAULT_UI_CONFIG),
      ...partial.ui,
      contextUsage: {
        ...DEFAULT_UI_CONFIG.contextUsage,
        ...partial.ui?.contextUsage,
      },
      priority: partial.ui?.priority ?? [...DEFAULT_UI_CONFIG.priority],
    },
    subagents: { ...DEFAULT_SUBAGENTS_CONFIG, ...partial.subagents },
    modelContextLimit: partial.modelContextLimit ?? DEFAULT_MODEL_CONTEXT_LIMIT,
    reservedOutputTokens: partial.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS,
  };
}
