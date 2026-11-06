import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type LockKind = 'web' | 'tui';

export interface WorkspaceLockInfo {
  pid: number;
  kind: LockKind;
  startedAt: number;
  workspace: string;
}

function locksDir(): string {
  return join(homedir(), '.ciro', 'locks');
}

export function workspaceLockPath(workspace: string): string {
  const hash = createHash('sha256').update(workspace).digest('hex').slice(0, 16);
  return join(locksDir(), `${hash}.lock`);
}

function pidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readWorkspaceLock(workspace: string): WorkspaceLockInfo | null {
  const path = workspaceLockPath(workspace);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as WorkspaceLockInfo;
    if (!raw?.pid || !raw.kind) {
      unlinkSync(path);
      return null;
    }
    if (!pidAlive(raw.pid)) {
      unlinkSync(path);
      return null;
    }
    return raw;
  } catch {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
    return null;
  }
}

export function acquireWorkspaceLock(
  workspace: string,
  kind: LockKind,
  opts?: { allowConcurrent?: boolean },
): { ok: true } | { ok: false; existing: WorkspaceLockInfo } {
  const existing = readWorkspaceLock(workspace);
  if (existing && existing.pid !== process.pid) {
    if (!opts?.allowConcurrent) {
      return { ok: false, existing };
    }
    // allowConcurrent：不抢锁，调用方自行加会话前缀
    return { ok: true };
  }
  mkdirSync(locksDir(), { recursive: true });
  const info: WorkspaceLockInfo = {
    pid: process.pid,
    kind,
    startedAt: Date.now(),
    workspace,
  };
  writeFileSync(workspaceLockPath(workspace), JSON.stringify(info), 'utf8');
  return { ok: true };
}

export function releaseWorkspaceLock(workspace: string): void {
  const path = workspaceLockPath(workspace);
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as WorkspaceLockInfo;
    if (raw.pid === process.pid) unlinkSync(path);
  } catch {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
}
