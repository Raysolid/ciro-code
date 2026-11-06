import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  legacyPathWarning,
  legacyRecentWorkspacesPath,
  recentWorkspacesPath,
  resolveReadable,
} from '../paths/product-paths.js';

const MAX_RECENT = 12;

export function defaultRecentWorkspacesPath(): string {
  return recentWorkspacesPath();
}

function resolveRecentPath(): string {
  const resolved = resolveReadable(recentWorkspacesPath(), legacyRecentWorkspacesPath());
  if (resolved.fromLegacy) {
    console.warn(`[ciro] ${legacyPathWarning('recent-workspaces', legacyRecentWorkspacesPath())}`);
  }
  return resolved.path;
}

function isExistingDir(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readRaw(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as { workspaces?: unknown };
    if (!Array.isArray(raw.workspaces)) return [];
    return raw.workspaces.filter((p): p is string => typeof p === 'string' && p.length > 0);
  } catch {
    return [];
  }
}

function writeList(filePath: string, workspaces: string[]): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ workspaces }, null, 2), 'utf-8');
}

/** 读取 Recent；已不存在的目录会被过滤（视为用户删除） */
export function readRecentWorkspaces(filePath?: string): string[] {
  const path = filePath ?? resolveRecentPath();
  const raw = readRaw(path);
  const next = raw.filter(isExistingDir);
  if (next.length !== raw.length) {
    writeList(filePath ?? recentWorkspacesPath(), next);
  }
  return next;
}

export function pushRecentWorkspace(
  workspace: string,
  filePath?: string,
): string[] {
  const resolved = resolve(workspace);
  const writePath = filePath ?? recentWorkspacesPath();
  const prev = readRecentWorkspaces(filePath);
  // 已在列表中：保持原位置，切换工作区不置顶
  if (prev.some((p) => resolve(p) === resolved)) {
    return prev;
  }
  const next = [resolved, ...prev].slice(0, MAX_RECENT);
  writeList(writePath, next);
  return next;
}

/** 从 Recent 中移除（手动删除工作区记录） */
export function removeRecentWorkspace(
  workspace: string,
  filePath?: string,
): string[] {
  const resolved = resolve(workspace);
  const writePath = filePath ?? recentWorkspacesPath();
  const next = readRecentWorkspaces(filePath).filter((p) => resolve(p) !== resolved);
  writeList(writePath, next);
  return next;
}
