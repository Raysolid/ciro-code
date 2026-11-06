import { readFileSync } from 'node:fs';
import { roughTokenEstimate } from '../context/token-estimate.js';
import type { SkillMeta, SkillRegistry } from './skill-registry.js';

export interface SkillInjectionResult {
  injection: string;
  activated: SkillMeta[];
  paths: string[];
  tokenEstimate: number;
  truncated: boolean;
}

function mcpRequirementsMet(
  requiresMcp: readonly string[],
  enabledMcpIds: ReadonlySet<string> | undefined,
): boolean {
  if (requiresMcp.length === 0) return true;
  if (!enabledMcpIds || enabledMcpIds.size === 0) return false;
  return requiresMcp.every((id) => enabledMcpIds.has(id));
}

/**
 * 按需注入 Skill 正文，填满 maxInjectTokens 即停。
 * 优先级：消息中 `/${name}` 或自定义 trigger 命中；同名去重后按发现顺序。
 * `requiresMcp` 未全部落在会话启用集时整 skill 跳过。
 */
export function assembleSkillInjection(
  registry: SkillRegistry,
  message: string,
  opts?: { maxInjectTokens?: number; enabledMcpIds?: ReadonlySet<string> },
): SkillInjectionResult {
  const budget = opts?.maxInjectTokens ?? registry.maxInjectTokens;
  const activated = registry.matchTriggers(message);
  if (activated.length === 0) {
    return { injection: '', activated: [], paths: [], tokenEstimate: 0, truncated: false };
  }

  const parts: string[] = [];
  const paths: string[] = [];
  let used = 0;
  let truncated = false;
  const included: SkillMeta[] = [];

  for (const skill of activated) {
    if (!mcpRequirementsMet(skill.requiresMcp, opts?.enabledMcpIds)) {
      continue;
    }
    let body: string;
    try {
      body = readFileSync(skill.path, 'utf-8');
    } catch {
      continue;
    }
    // 去掉 frontmatter 以省预算
    const content = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    const block = `## Skill: ${skill.name}\n\n${content}`;
    const tokens = roughTokenEstimate(block);
    if (used + tokens > budget) {
      const remainChars = Math.max(0, (budget - used) * 4);
      if (remainChars < 80) {
        truncated = true;
        break;
      }
      parts.push(block.slice(0, remainChars) + '\n…');
      paths.push(skill.path);
      included.push(skill);
      used = budget;
      truncated = true;
      break;
    }
    parts.push(block);
    paths.push(skill.path);
    included.push(skill);
    used += tokens;
  }

  const injection =
    parts.length > 0
      ? `# Active skills\n\n${parts.join('\n\n---\n\n')}`
      : '';

  return {
    injection,
    activated: included,
    paths,
    tokenEstimate: roughTokenEstimate(injection),
    truncated,
  };
}
