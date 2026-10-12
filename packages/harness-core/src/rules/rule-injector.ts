import { readFileSync } from 'node:fs';
import { MAX_RULES_TOKENS } from '@ciro-code/harness-shared';
import { roughTokenEstimate } from '../context/token-estimate.js';
import type { RuleMeta, RuleRegistry } from './rule-registry.js';
import { parseRuleFrontmatter } from './rule-registry.js';

export type RuleInjectionResult = {
  injection: string;
  included: RuleMeta[];
  paths: string[];
  tokenEstimate: number;
  truncated: boolean;
};

/** 极简 glob：支持 * 与 **（/ 分隔） */
export function matchGlob(path: string, pattern: string): boolean {
  const norm = path.replace(/\\/g, '/');
  const pat = pattern.replace(/\\/g, '/');
  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '«GLOBSTAR»')
    .replace(/\*/g, '[^/]*')
    .replace(/«GLOBSTAR»/g, '.*');
  return new RegExp(`^${escaped}$`).test(norm);
}

function pathTokensFromMessage(message: string): string[] {
  const matches = message.match(/[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+/g) ?? [];
  return matches.map((m) => m.replace(/\\/g, '/'));
}

/** 无 globs → 常驻；有 globs → 仅消息路径样 token 命中时注入（无路径则不注入） */
export function ruleMatchesMessage(rule: RuleMeta, message: string): boolean {
  if (!rule.enabled) return false;
  if (rule.source === 'agents') return false; // Pi 已加载，不重复
  if (rule.globs.length === 0) return true;
  const tokens = pathTokensFromMessage(message);
  if (tokens.length === 0) return false;
  return rule.globs.some((g) => tokens.some((t) => matchGlob(t, g)));
}

/**
 * 常驻注入 `.ciro/rules` + `~/.ciro/rules`（截断上限内）。
 * 不含项目根 AGENTS.md（由 Pi ResourceLoader 加载）。
 */
export function assembleRulesInjection(
  registry: RuleRegistry,
  message: string,
  opts?: { maxRulesTokens?: number },
): RuleInjectionResult {
  const budget = opts?.maxRulesTokens ?? MAX_RULES_TOKENS;
  const candidates = registry.list().filter((r) => ruleMatchesMessage(r, message));
  if (candidates.length === 0) {
    return { injection: '', included: [], paths: [], tokenEstimate: 0, truncated: false };
  }

  const parts: string[] = [];
  const paths: string[] = [];
  const included: RuleMeta[] = [];
  let used = 0;
  let truncated = false;

  for (const rule of candidates) {
    let raw: string;
    try {
      raw = readFileSync(rule.path, 'utf-8');
    } catch {
      continue;
    }
    const { body } = parseRuleFrontmatter(raw);
    if (!body.trim()) continue;
    const block = `## Rule: ${rule.name} (${rule.source})\n\n${body}`;
    const tokens = roughTokenEstimate(block);
    if (used + tokens > budget) {
      const remainChars = Math.max(0, (budget - used) * 4);
      if (remainChars < 80) {
        truncated = true;
        break;
      }
      parts.push(block.slice(0, remainChars) + '\n…');
      paths.push(rule.path);
      included.push(rule);
      used = budget;
      truncated = true;
      break;
    }
    parts.push(block);
    paths.push(rule.path);
    included.push(rule);
    used += tokens;
  }

  const injection =
    parts.length > 0 ? `# Active rules\n\n${parts.join('\n\n---\n\n')}` : '';

  return {
    injection,
    included,
    paths,
    tokenEstimate: roughTokenEstimate(injection),
    truncated,
  };
}
