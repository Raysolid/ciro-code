import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { join, relative } from 'node:path';
import { assertReadable, isDeniedPath, resolveWorkspacePath, SandboxError } from '../sandbox/path-sandbox.js';
import {
  detectFileKind,
  isTextPreviewKind,
  mimeForPath,
  type FileKind,
} from './file-kind.js';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', 'coverage']);

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileTreeNode[];
  /** 懒加载：目录是否有可见子项（仅 maxDepth=1 时返回） */
  hasChildren?: boolean;
}

/** 单层目录列表；compactSegments 为中间包压缩链（如 com/ciro/chat） */
export interface DirectoryListing {
  /** 请求路径 */
  path: string;
  /** 解析后的实际目录（沿单子目录链压缩后） */
  resolvedPath: string;
  compactSegments: string[];
  children: FileTreeNode[];
}

/** 单子目录链最大压缩深度，防止异常目录结构死循环 */
export const MAX_COMPACT_CHAIN = 24;

export interface FileStatInfo {
  path: string;
  size: number;
  kind: FileKind;
  mime: string;
}

function toRel(workspace: string, abs: string): string {
  return relative(resolveWorkspacePath(workspace, '.'), abs).replace(/\\/g, '/');
}

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/');
}

function childRelPath(dirRel: string, name: string): string {
  return (dirRel === '.' ? name : `${dirRel}/${name}`).replace(/\\/g, '/');
}

/** 读取单层可见子项（不递归） */
export function listImmediateChildren(
  workspace: string,
  relPath = '.',
): FileTreeNode[] {
  const abs = assertReadable(workspace, relPath);
  const st = statSync(abs);
  if (!st.isDirectory()) return [];

  const dirRel = normalizeRelPath(relPath);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileTreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory() && SKIP.has(entry.name)) continue;
    const childAbs = join(abs, entry.name);
    if (isDeniedPath(childAbs)) continue;
    const childRel = childRelPath(dirRel, entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: childRel,
        type: 'dir',
        hasChildren: dirHasVisibleChildren(workspace, childRel),
      });
    } else {
      nodes.push({ name: entry.name, path: childRel, type: 'file' });
    }
  }
  return nodes.sort((a, b) => {
    const aDir = a.type === 'dir';
    const bDir = b.type === 'dir';
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function dirHasVisibleChildren(workspace: string, relPath: string): boolean {
  try {
    return listImmediateChildren(workspace, relPath).length > 0;
  } catch {
    return false;
  }
}

/**
 * 懒加载目录列表：可选中间包压缩（仅含唯一子目录且无文件时合并为 com \\ ciro \\ chat）。
 */
export function listDirectoryListing(
  workspace: string,
  relPath = '.',
  compact = true,
): DirectoryListing {
  const path = normalizeRelPath(relPath);
  const abs = assertReadable(workspace, path);
  if (!statSync(abs).isDirectory()) {
    throw new SandboxError(`Not a directory: ${path}`);
  }

  let resolvedPath = path;
  const compactSegments: string[] = [];

  if (compact) {
    for (let i = 0; i < MAX_COMPACT_CHAIN; i++) {
      const children = listImmediateChildren(workspace, resolvedPath);
      const dirs = children.filter((c) => c.type === 'dir');
      const files = children.filter((c) => c.type === 'file');
      if (dirs.length === 1 && files.length === 0) {
        compactSegments.push(dirs[0].name);
        resolvedPath = dirs[0].path;
        continue;
      }
      break;
    }
  }

  const children = listImmediateChildren(workspace, resolvedPath);
  return { path, resolvedPath, compactSegments, children };
}

export function listFileTree(
  workspace: string,
  relPath = '.',
  maxDepth = 1,
): FileTreeNode {
  const path = normalizeRelPath(relPath);
  const abs = assertReadable(workspace, path);
  const st = statSync(abs);
  const name = path === '.' ? '.' : path.split('/').pop()!;
  if (!st.isDirectory()) {
    return { name, path, type: 'file' };
  }

  if (maxDepth <= 1) {
    return {
      name,
      path,
      type: 'dir',
      children: listImmediateChildren(workspace, path),
    };
  }

  function walk(dirAbs: string, dirRel: string, depth: number): FileTreeNode[] {
    if (depth > maxDepth) return [];
    let entries;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: FileTreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && SKIP.has(entry.name)) continue;
      const childAbs = join(dirAbs, entry.name);
      if (isDeniedPath(childAbs)) continue;
      const childRel = childRelPath(dirRel, entry.name);
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: childRel,
          type: 'dir',
          children: walk(childAbs, childRel, depth + 1),
        });
      } else {
        nodes.push({ name: entry.name, path: childRel, type: 'file' });
      }
    }
    return nodes.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    name,
    path,
    type: 'dir',
    children: walk(abs, path, 1),
  };
}

export function statWorkspaceFile(workspace: string, inputPath: string): FileStatInfo {
  const abs = assertReadable(workspace, inputPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new SandboxError(`File not found: ${inputPath}`);
  }
  const st = statSync(abs);
  const path = toRel(workspace, abs);
  const kind = detectFileKind(path);
  return {
    path,
    size: st.size,
    kind,
    mime: mimeForPath(path),
  };
}

/** Preview read limits (UI file pane; unrelated to Agent tool read). */
export const PREVIEW_SOFT_BYTES = 512_000;
export const PREVIEW_DEFAULT_LINES = 4000;
export const PREVIEW_MAX_LINES = 10_000;
export const PREVIEW_HARD_BYTES = 2_000_000;

export interface WorkspaceFileContent {
  path: string;
  content: string;
  truncated: boolean;
  totalLines: number;
  byteSize: number;
  nextOffset?: number;
}

export function readWorkspaceFile(
  workspace: string,
  relPath: string,
  opts?: { offset?: number; limit?: number },
): WorkspaceFileContent {
  const abs = assertReadable(workspace, relPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new SandboxError(`File not found: ${relPath}`);
  }
  const path = toRel(workspace, abs);
  const kind = detectFileKind(path);
  if (!isTextPreviewKind(kind)) {
    throw new SandboxError(
      `File is not text-previewable (kind=${kind}). Use /files/raw or open externally.`,
    );
  }
  const st = statSync(abs);
  const byteSize = st.size;
  const raw = readFileSync(abs, 'utf-8');
  const lines = raw.split('\n');
  const totalLines = lines.length;
  const offset = Math.max(1, opts?.offset ?? 1);

  let limit: number;
  if (opts?.limit != null) {
    limit = Math.min(Math.max(1, opts.limit), PREVIEW_MAX_LINES);
  } else if (byteSize <= PREVIEW_SOFT_BYTES) {
    limit = Math.min(totalLines, PREVIEW_MAX_LINES);
  } else {
    limit = Math.min(PREVIEW_DEFAULT_LINES, PREVIEW_MAX_LINES);
  }

  const start = offset - 1;
  const endExclusive = Math.min(start + limit, totalLines);
  let slice = lines.slice(start, endExclusive);
  let content = slice.join('\n');
  let hardByteCut = false;
  if (content.length > PREVIEW_HARD_BYTES) {
    content = content.slice(0, PREVIEW_HARD_BYTES);
    hardByteCut = true;
    // Approximate lines returned under hard byte cap for nextOffset.
    const partial = content.split('\n');
    slice = partial;
  }

  const linesReturned = slice.length;
  const coveredAllLines = start + linesReturned >= totalLines && !hardByteCut;
  const truncated = !coveredAllLines;
  const nextOffset = truncated ? offset + linesReturned : undefined;

  return {
    path,
    content,
    truncated,
    totalLines,
    byteSize,
    nextOffset,
  };
}

export function openWorkspaceRawStream(
  workspace: string,
  inputPath: string,
): { path: string; mime: string; size: number; stream: ReadStream } {
  const abs = assertReadable(workspace, inputPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new SandboxError(`File not found: ${inputPath}`);
  }
  const st = statSync(abs);
  const path = toRel(workspace, abs);
  return {
    path,
    mime: mimeForPath(path),
    size: st.size,
    stream: createReadStream(abs),
  };
}

const SEARCH_LIMIT_MAX = 50;

/** 子串搜索工作区路径；空 q 返回空（Composer 空查询走 directory listing） */
export function searchWorkspacePaths(
  workspace: string,
  q: string,
  limit = 20,
): FileTreeNode[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const cap = Math.min(Math.max(1, limit), SEARCH_LIMIT_MAX);
  const out: FileTreeNode[] = [];
  const queue: string[] = ['.'];
  while (queue.length > 0 && out.length < cap) {
    const dirRel = queue.shift()!;
    let children: FileTreeNode[];
    try {
      children = listImmediateChildren(workspace, dirRel);
    } catch {
      continue;
    }
    for (const child of children) {
      const hay = `${child.name} ${child.path}`.toLowerCase();
      if (hay.includes(needle)) {
        out.push({ name: child.name, path: child.path, type: child.type });
        if (out.length >= cap) break;
      }
      if (child.type === 'dir') queue.push(child.path);
    }
  }
  return out;
}
