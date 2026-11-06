import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isMap, parseDocument } from 'yaml';
import { globalConfigPath } from '../paths/product-paths.js';

/**
 * 窄写全局 `~/.ciro/config.yaml` 的 `shell.path`。
 * `path` 为 null/空串时删除该键（恢复有限探测）。
 */
export function patchGlobalShellPath(
  path: string | null,
): { configPath: string; path: string | undefined } {
  const configPath = globalConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  const raw = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
  const doc = parseDocument(raw || '');
  const trimmed = path?.trim() || '';
  if (!trimmed) {
    doc.deleteIn(['shell', 'path']);
    const shellNode = doc.get('shell');
    if (!shellNode || (isMap(shellNode) && shellNode.items.length === 0)) {
      doc.delete('shell');
    }
    writeFileSync(configPath, String(doc), 'utf-8');
    return { configPath, path: undefined };
  }
  doc.setIn(['shell', 'path'], trimmed);
  writeFileSync(configPath, String(doc), 'utf-8');
  return { configPath, path: trimmed };
}
