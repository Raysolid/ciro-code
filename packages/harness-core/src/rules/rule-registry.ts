import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { globalRulesDir, projectRulesDir } from '../paths/product-paths.js';

export type RuleSource = 'project' | 'global' | 'agents';

export type RuleMeta = {
  id: string;
  name: string;
  description?: string;
  path: string;
  source: RuleSource;
  globs: string[];
  enabled: boolean;
};

export type RuleRegistryOptions = {
  workspace: string;
};

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseFrontmatter(content: string): {
  description?: string;
  globs: string[];
  enabled: boolean;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { globs: [], enabled: true, body: content.trim() };
  }
  const block = match[1]!;
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  const globsRaw =
    block.match(/^globs:\s*\[([^\]]*)\]/m)?.[1] ??
    block.match(/^globs:\s*(.+)$/m)?.[1];
  const enabledRaw = block.match(/^enabled:\s*(.+)$/m)?.[1]?.trim()?.toLowerCase();
  const enabled = enabledRaw === undefined ? true : enabledRaw !== 'false' && enabledRaw !== '0';
  return {
    description,
    globs: parseList(globsRaw),
    enabled,
    body: content.slice(match[0].length).trim(),
  };
}

/** 相对路径统一为 /，供 id / name（顶层 foo.md → id 仍为 source:foo.md） */
function toPosixRel(rel: string): string {
  return rel.split(sep).join('/');
}

function pushRuleFile(
  abs: string,
  relPosix: string,
  source: 'project' | 'global',
  out: RuleMeta[],
): void {
  let content: string;
  try {
    content = readFileSync(abs, 'utf-8');
  } catch {
    return;
  }
  const meta = parseFrontmatter(content);
  const id = `${source}:${relPosix}`;
  out.push({
    id,
    name: relPosix.replace(/\.md$/i, ''),
    description: meta.description,
    path: abs,
    source,
    globs: meta.globs,
    enabled: meta.enabled,
  });
}

function scanRulesDir(dir: string, source: 'project' | 'global', out: RuleMeta[]): void {
  if (!existsSync(dir)) return;

  const walk = (current: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = join(current, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!st.isFile() || !name.endsWith('.md')) continue;
      const relPosix = toPosixRel(relative(dir, abs));
      pushRuleFile(abs, relPosix, source, out);
    }
  };

  walk(dir);
}

/** 发现工作区 / 用户级 Rules；项目根 AGENTS.md 作为特殊条目（不由本 Registry 注入） */
export class RuleRegistry {
  readonly workspace: string;

  constructor(opts: RuleRegistryOptions) {
    this.workspace = opts.workspace;
  }

  list(): RuleMeta[] {
    const out: RuleMeta[] = [];
    const agentsPath = join(this.workspace, 'AGENTS.md');
    if (existsSync(agentsPath)) {
      out.push({
        id: 'agents:AGENTS.md',
        name: 'AGENTS.md',
        description: 'Project constitution (loaded by runtime; not re-injected)',
        path: agentsPath,
        source: 'agents',
        globs: [],
        enabled: true,
      });
    }
    scanRulesDir(projectRulesDir(this.workspace), 'project', out);
    scanRulesDir(globalRulesDir(), 'global', out);
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }

  readBody(id: string): { meta: RuleMeta; body: string; raw: string } | null {
    const meta = this.list().find((r) => r.id === id);
    if (!meta) return null;
    let raw: string;
    try {
      raw = readFileSync(meta.path, 'utf-8');
    } catch {
      return null;
    }
    if (meta.source === 'agents') {
      return { meta, body: raw, raw };
    }
    const parsed = parseFrontmatter(raw);
    return { meta: { ...meta, ...{ description: parsed.description, globs: parsed.globs, enabled: parsed.enabled } }, body: parsed.body, raw };
  }

  /** 写回正文；agents 整文件覆盖；rules 保留/重建 frontmatter */
  writeBody(
    id: string,
    body: string,
    opts?: { enabled?: boolean; description?: string; globs?: string[] },
  ): RuleMeta {
    const existing = this.list().find((r) => r.id === id);
    if (!existing) throw new Error(`Rule not found: ${id}`);

    if (existing.source === 'agents') {
      writeFileSync(existing.path, body, 'utf-8');
      return { ...existing };
    }

    const cur = this.readBody(id);
    const enabled = opts?.enabled ?? cur?.meta.enabled ?? true;
    const description = opts?.description ?? cur?.meta.description;
    const globs = opts?.globs ?? cur?.meta.globs ?? [];
    const fmLines = ['---'];
    if (description) fmLines.push(`description: ${description}`);
    if (globs.length > 0) fmLines.push(`globs: [${globs.map((g) => JSON.stringify(g)).join(', ')}]`);
    fmLines.push(`enabled: ${enabled}`);
    fmLines.push('---', '', body.trim(), '');
    mkdirSync(dirname(existing.path), { recursive: true });
    writeFileSync(existing.path, fmLines.join('\n'), 'utf-8');
    return {
      ...existing,
      description,
      globs,
      enabled,
    };
  }

  setEnabled(id: string, enabled: boolean): RuleMeta {
    const cur = this.readBody(id);
    if (!cur) throw new Error(`Rule not found: ${id}`);
    if (cur.meta.source === 'agents') {
      throw new Error('AGENTS.md cannot be disabled');
    }
    return this.writeBody(id, cur.body, { enabled });
  }

  /** 新建 project/global 规则文件 */
  create(opts: {
    source: 'project' | 'global';
    name: string;
    body?: string;
    description?: string;
    globs?: string[];
  }): RuleMeta {
    const safe = opts.name.replace(/[^\w.-]+/g, '-').replace(/\.md$/i, '');
    if (!safe) throw new Error('Invalid rule name');
    const dir = opts.source === 'project' ? projectRulesDir(this.workspace) : globalRulesDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${safe}.md`);
    if (existsSync(path)) throw new Error(`Rule already exists: ${basename(path)}`);
    const id = `${opts.source}:${safe}.md`;
    writeFileSync(path, '', 'utf-8');
    return this.writeBody(id, opts.body ?? '', {
      enabled: true,
      description: opts.description,
      globs: opts.globs,
    });
  }
}

export { parseFrontmatter as parseRuleFrontmatter };
