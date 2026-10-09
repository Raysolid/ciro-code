import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { homeRoot } from '../paths/product-paths.js';

/** Profile overlay 原始字段（叠在 ModeProfile 上，不替换四模式 prompt） */
export interface ProfileRaw {
  mode?: string;
  tools?: string[];
  permissions?: { preset?: string };
  memory?: {
    storage?: 'file' | 'hybrid';
    indexing?: 'bm25' | 'embedding' | 'hybrid';
    enableEmbedding?: boolean;
    maxMemoryFiles?: number;
  };
  skill?: {
    maxInjectTokens?: number;
    autoActivateByKeyword?: boolean;
    autoActivateByMode?: boolean;
    enableSkillTool?: boolean;
  };
}

export function userProfilesDir(): string {
  return join(homeRoot(), 'profiles');
}

/** 仓库内置 profiles：`ciro/profiles/*.yaml`（相对 harness-core dist/config） */
export function builtinProfilesDir(): string {
  return join(fileURLToPath(new URL('../../../../profiles', import.meta.url)));
}

/**
 * 解析 Profile：`~/.ciro/profiles/<id>.yaml` 优先，否则内置 `ciro/profiles/<id>.yaml`。
 * 未知 id 抛错（禁止静默 fallback）。
 */
export function resolveProfileYamlPath(profileId: string): string {
  const id = profileId.trim();
  if (!id || /[\\/]/.test(id) || id.includes('..')) {
    throw new Error(`Invalid profile id: ${profileId}`);
  }
  const userPath = join(userProfilesDir(), `${id}.yaml`);
  if (existsSync(userPath)) return userPath;
  const builtinPath = join(builtinProfilesDir(), `${id}.yaml`);
  if (existsSync(builtinPath)) return builtinPath;
  throw new Error(
    `Profile "${id}" not found (checked ~/.ciro/profiles/${id}.yaml and builtin profiles)`,
  );
}

export function loadProfileOverlay(profileId: string): {
  id: string;
  path: string;
  raw: ProfileRaw;
} {
  const path = resolveProfileYamlPath(profileId);
  const raw = (parseYaml(readFileSync(path, 'utf-8')) as ProfileRaw) ?? {};
  return { id: profileId.trim(), path, raw };
}
