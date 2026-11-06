import { roughTokenEstimate } from '../context/token-estimate.js';
import { GLOBAL_AGENTS_MAX_CHARS, MEMORY_MD_MAX_CHARS } from './memory-entries.js';
import { readGlobalAgents } from './global-agents.js';
import type { MemoryStore } from './memory-store.js';
import { DISPLAY_GLOBAL_AGENTS, DISPLAY_MEMORY_MD } from '../paths/product-paths.js';

export interface MemoryAdvisorResult {
  injection: string;
  paths: string[];
  tokenEstimate: number;
}

function truncate(text: string, maxChars: number): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + '\n…';
}

/**
 * 注入全局 AGENTS.md + 项目 MEMORY.md（无检索）。
 * 项目根 AGENTS.md 由 Pi ResourceLoader 原生加载，此处不再重复。
 * 冲突裁决写在文案中：项目 > 全局；本轮用户口头指令覆盖文件。
 */
export function assembleMemoryInjection(
  store: MemoryStore,
  _userMessage?: string,
  opts: { maxTokens?: number } = {},
): MemoryAdvisorResult {
  const maxTokens = opts.maxTokens ?? 4000;
  const parts: string[] = [];
  const paths: string[] = [];

  const globalBody = truncate(readGlobalAgents(), GLOBAL_AGENTS_MAX_CHARS);
  if (globalBody) {
    parts.push(`<global_memory>\n${globalBody}\n</global_memory>`);
    paths.push(DISPLAY_GLOBAL_AGENTS);
  }

  const projectBody = truncate(store.getMemoryMd(), MEMORY_MD_MAX_CHARS);
  if (projectBody) {
    parts.push(`<project_memory>\n${projectBody}\n</project_memory>`);
    paths.push(DISPLAY_MEMORY_MD);
  }

  if (parts.length === 0) {
    return { injection: '', paths: [], tokenEstimate: 0 };
  }

  const rules = [
    'Memory conflict rules:',
    '- Project memory (<project_memory> and workspace AGENTS.md) overrides global memory.',
    '- The user\'s explicit instructions in this turn override both memory files.',
  ].join('\n');

  let injection = `# Memory\n\n${rules}\n\n${parts.join('\n\n')}`;

  while (injection && roughTokenEstimate(injection) > maxTokens && parts.length > 1) {
    // 优先丢掉全局，保留项目
    parts.shift();
    paths.shift();
    injection = `# Memory\n\n${rules}\n\n${parts.join('\n\n')}`;
  }

  if (roughTokenEstimate(injection) > maxTokens && parts.length === 1) {
    const only = parts[0]!;
    const budget = Math.max(200, Math.floor((maxTokens * 4) * 0.7));
    const clipped = only.length > budget ? only.slice(0, budget) + '\n…' : only;
    injection = `# Memory\n\n${rules}\n\n${clipped}`;
  }

  return {
    injection,
    paths,
    tokenEstimate: roughTokenEstimate(injection),
  };
}
