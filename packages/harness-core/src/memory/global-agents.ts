import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import {
  DISPLAY_GLOBAL_AGENTS,
  globalAgentsFilePath,
  legacyGlobalAgentsFilePath,
  legacyPathWarning,
  resolveReadable,
} from '../paths/product-paths.js';

/** 测试可覆盖；生产保持 null */
let pathOverride: string | null = null;

export function setGlobalAgentsPathOverride(path: string | null): void {
  pathOverride = path;
}

/** 新写路径：`~/.ciro/AGENTS.md` */
export function globalAgentsPath(): string {
  return pathOverride ?? globalAgentsFilePath();
}

export function readGlobalAgents(): string {
  if (pathOverride) {
    return existsSync(pathOverride) ? readFileSync(pathOverride, 'utf-8') : '';
  }
  const resolved = resolveReadable(globalAgentsFilePath(), legacyGlobalAgentsFilePath());
  if (resolved.fromLegacy) {
    console.warn(`[ciro] ${legacyPathWarning('global AGENTS.md', legacyGlobalAgentsFilePath())}`);
  }
  return existsSync(resolved.path) ? readFileSync(resolved.path, 'utf-8') : '';
}

export function writeGlobalAgents(content: string): void {
  const path = globalAgentsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

const GLOBAL_AGENTS_ALIASES = new Set([
  DISPLAY_GLOBAL_AGENTS,
  '~/.ciro/AGENTS.md',
  '~\\.ciro\\AGENTS.md',
  '$HOME/.ciro/AGENTS.md',
  // legacy（迁移期仍识别，写入仍落到 primary）
  '~/.pi/agent/AGENTS.md',
  '~\\.pi\\agent\\AGENTS.md',
  '$HOME/.pi/agent/AGENTS.md',
  'global:AGENTS.md',
  'global/AGENTS.md',
]);

/** 判断工具/API 路径是否指向全局 AGENTS.md（唯一允许的 workspace 外记忆写路径） */
export function isGlobalAgentsPath(inputPath: string): boolean {
  const trimmed = inputPath.trim();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/\\/g, '/');
  if (GLOBAL_AGENTS_ALIASES.has(trimmed) || GLOBAL_AGENTS_ALIASES.has(normalized)) {
    return true;
  }
  try {
    const abs = resolve(normalize(trimmed));
    return (
      abs === resolve(globalAgentsFilePath()) || abs === resolve(legacyGlobalAgentsFilePath())
    );
  } catch {
    return false;
  }
}

export const DEFAULT_GLOBAL_AGENTS_TEMPLATE = `# Global Agent Preferences

Cross-project preferences and habits. Keep concise.

## Preferences

-
`;
