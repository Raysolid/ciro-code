import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDocument } from 'yaml';
import { projectConfigPath } from '../paths/product-paths.js';

export type ExploreModelSetting = 'fast' | 'inherit';

/** 仅写入项目 `{ws}/.ciro/config.yaml` 的 `subagents.exploreModel`；禁止通用 YAML PATCH */
export function patchProjectExploreModel(
  workspace: string,
  exploreModel: ExploreModelSetting,
): { path: string; exploreModel: ExploreModelSetting } {
  if (exploreModel !== 'fast' && exploreModel !== 'inherit') {
    throw new Error('exploreModel must be inherit or fast');
  }
  const path = projectConfigPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  const raw = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const doc = parseDocument(raw || '');
  doc.setIn(['subagents', 'exploreModel'], exploreModel);
  writeFileSync(path, String(doc), 'utf-8');
  return { path, exploreModel };
}
