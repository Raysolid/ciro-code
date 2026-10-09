import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_INJECT_TOKENS } from '@ciro/harness-shared';
import {
  globalSkillsDir,
  legacyGlobalSkillsDir,
  legacyProjectSkillsDir,
  projectSkillsDir,
} from '../paths/product-paths.js';

export interface SkillMeta {
  name: string;
  description?: string;
  path: string;
  source: 'global' | 'project';
  triggers: string[];
  /** 注入前须全部在会话启用 MCP 集合中 */
  requiresMcp: string[];
}

export interface SkillRegistryOptions {
  workspace: string;
  maxInjectTokens?: number;
}

function tokenHit(message: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s])${escaped}(?=$|[\\s.,;:!?])`).test(message);
}

function parseYamlStringList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
  triggers: string[];
  requiresMcp: string[];
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { triggers: [], requiresMcp: [] };
  }
  const block = match[1]!;
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  const triggersRaw = block.match(/^triggers:\s*\[([^\]]*)\]/m)?.[1];
  const requiresMcpRaw = block.match(/^requiresMcp:\s*\[([^\]]*)\]/m)?.[1];
  return {
    name,
    description,
    triggers: parseYamlStringList(triggersRaw),
    requiresMcp: parseYamlStringList(requiresMcpRaw),
  };
}

function scanDir(dir: string, source: 'global' | 'project', out: SkillMeta[]): void {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const skillMd = join(abs, 'SKILL.md');
      if (existsSync(skillMd)) {
        const content = readFileSync(skillMd, 'utf-8');
        const meta = parseFrontmatter(content);
        out.push({
          name: meta.name ?? name,
          description: meta.description,
          path: skillMd,
          source,
          triggers: meta.triggers,
          requiresMcp: meta.requiresMcp,
        });
      }
    } else if (name.endsWith('.md')) {
      const content = readFileSync(abs, 'utf-8');
      const meta = parseFrontmatter(content);
      const skillName = meta.name ?? name.replace(/\.md$/, '');
      out.push({
        name: skillName,
        description: meta.description,
        path: abs,
        source,
        triggers: meta.triggers.length > 0 ? meta.triggers : [`@${skillName}`],
        requiresMcp: meta.requiresMcp,
      });
    }
  }
}

export class SkillRegistry {
  readonly maxInjectTokens: number;
  private workspace: string;
  private skills: SkillMeta[] = [];

  constructor(options: SkillRegistryOptions) {
    this.maxInjectTokens = options.maxInjectTokens ?? MAX_INJECT_TOKENS;
    this.workspace = options.workspace;
    this.reload();
  }

  /** 重新扫描磁盘（设置页刷新 / 工作区切换） */
  reload(): SkillMeta[] {
    this.skills = [];
    const globalPrimary = globalSkillsDir();
    const globalLegacy = legacyGlobalSkillsDir();
    scanDir(existsSync(globalPrimary) ? globalPrimary : globalLegacy, 'global', this.skills);
    const projectPrimary = projectSkillsDir(this.workspace);
    const projectLegacy = legacyProjectSkillsDir(this.workspace);
    scanDir(
      existsSync(projectPrimary) ? projectPrimary : projectLegacy,
      'project',
      this.skills,
    );
    return this.list();
  }

  rebind(workspace: string): SkillMeta[] {
    this.workspace = workspace;
    return this.reload();
  }

  list(): SkillMeta[] {
    return [...this.skills];
  }

  /** 从用户消息中匹配 `/${name}` 或自定义 trigger（词边界） */
  matchTriggers(message: string): SkillMeta[] {
    const activated: SkillMeta[] = [];
    for (const skill of this.skills) {
      if (tokenHit(message, `/${skill.name}`)) {
        activated.push(skill);
        continue;
      }
      for (const trigger of skill.triggers) {
        if (tokenHit(message, trigger)) {
          activated.push(skill);
          break;
        }
      }
    }
    return activated;
  }
}
