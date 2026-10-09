import { resolve, relative, normalize, sep } from 'node:path';
import { globalAgentsPath, isGlobalAgentsPath } from '../memory/global-agents.js';

const DENIED_PATTERNS = [
  /\.env$/,
  /\.env\./,
  /credentials\.json$/,
  /provider-keys\.json$/,
  /providers\.json$/,
  /\/credentials\//,
  /\\credentials\\/,
  /\.pem$/,
  /\.key$/,
  /id_rsa$/,
];

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

/** 将路径解析为 workspace 内的绝对路径，拒绝逃逸 */
export function resolveWorkspacePath(workspace: string, inputPath: string): string {
  const wsRoot = resolve(workspace);
  const target = resolve(wsRoot, inputPath);
  const rel = relative(wsRoot, target);

  if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
    throw new SandboxError(`Path escapes workspace: ${inputPath}`);
  }

  return target;
}

/**
 * 工具路径解析：workspace 内路径，或白名单全局 AGENTS.md（`~/.ciro/AGENTS.md`，兼容旧路径）。
 */
export function resolveToolPath(workspace: string, inputPath: string): string {
  if (isGlobalAgentsPath(inputPath)) {
    return globalAgentsPath();
  }
  return resolveWorkspacePath(workspace, inputPath);
}

/** 检查是否为敏感文件 */
export function isDeniedPath(filePath: string): boolean {
  const normalized = normalize(filePath).replace(/\\/g, '/');
  return DENIED_PATTERNS.some((p) => p.test(normalized));
}

export function assertReadable(workspace: string, inputPath: string): string {
  const abs = resolveToolPath(workspace, inputPath);
  if (isDeniedPath(abs)) {
    throw new SandboxError(`Access denied to sensitive file: ${inputPath}`);
  }
  return abs;
}

/** 写入前同样校验路径与敏感文件（含全局 AGENTS.md 白名单） */
export function assertWritable(workspace: string, inputPath: string): string {
  return assertReadable(workspace, inputPath);
}
