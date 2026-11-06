import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homeRoot } from '../paths/product-paths.js';

export type DaemonRegistryEntry = {
  pid: number;
  port: number;
  host: string;
  workspace: string;
  startedAt: number;
};

export function workspaceDaemonHash(workspace: string): string {
  const norm = workspace.replace(/[\\/]+$/, '').toLowerCase().replace(/\\/g, '/');
  return createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

export function daemonsDir(): string {
  return join(homeRoot(), 'daemons');
}

export function daemonRegistryPath(workspace: string): string {
  return join(daemonsDir(), `${workspaceDaemonHash(workspace)}.json`);
}

export function writeDaemonRegistry(entry: DaemonRegistryEntry): void {
  mkdirSync(daemonsDir(), { recursive: true });
  writeFileSync(daemonRegistryPath(entry.workspace), JSON.stringify(entry, null, 2), 'utf8');
}

export function readDaemonRegistry(workspace: string): DaemonRegistryEntry | null {
  const path = daemonRegistryPath(workspace);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as DaemonRegistryEntry;
    if (!raw || typeof raw.port !== 'number' || typeof raw.pid !== 'number') return null;
    return raw;
  } catch {
    return null;
  }
}

export function clearDaemonRegistry(workspace: string): void {
  const path = daemonRegistryPath(workspace);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // ignore
  }
}

export function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // Windows：无权限探测时进程通常仍存活
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function daemonBaseUrl(entry: DaemonRegistryEntry): string {
  const host = entry.host === '0.0.0.0' || entry.host === '::' ? '127.0.0.1' : entry.host;
  return `http://${host}:${entry.port}`;
}

export async function probeDaemonHealth(
  baseUrl: string,
  timeoutMs = 800,
): Promise<{ ok: boolean; workspace?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { status?: string; workspace?: string };
    return { ok: body.status === 'ok', workspace: body.workspace };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(t);
  }
}

function sameWorkspacePath(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return (
    a.replace(/[\\/]+$/, '').toLowerCase().replace(/\\/g, '/') ===
    b.replace(/[\\/]+$/, '').toLowerCase().replace(/\\/g, '/')
  );
}

export type FindHealthyDaemonOptions = {
  /** 注册表缺失或失效时，额外探测这些端口（默认含 5280） */
  fallbackPorts?: number[];
};

/**
 * 同 workspace 已有健康 daemon 则返回条目（供 `ciro web` / TUI 附着，勿再抢锁起第二份）。
 *
 * 注意：`/health.workspace` 是「当前选中工作区」，可被 UI 切换，不能用来否定注册表。
 * 亲和性以注册表 `entry.workspace` 为准。
 */
export async function findHealthyDaemon(
  workspace: string,
  timeoutMs = 1200,
  opts?: FindHealthyDaemonOptions,
): Promise<DaemonRegistryEntry | null> {
  const existing = readDaemonRegistry(workspace);
  if (existing && sameWorkspacePath(existing.workspace, workspace)) {
    const baseUrl = daemonBaseUrl(existing);
    const health = await probeDaemonHealth(baseUrl, timeoutMs);
    if (health.ok) return existing;
    // 端口无响应且 pid 已死 → 清掉脏注册表
    if (!isPidAlive(existing.pid)) {
      clearDaemonRegistry(workspace);
    }
  }

  const ports = [
    ...new Set(
      (opts?.fallbackPorts ?? [5280]).filter((p) => typeof p === 'number' && p > 0),
    ),
  ];
  for (const port of ports) {
    if (existing && existing.port === port) continue;
    const baseUrl = `http://127.0.0.1:${port}`;
    const health = await probeDaemonHealth(baseUrl, timeoutMs);
    if (!health.ok) continue;
    // 无注册表时：仅当 health 当前工作区匹配，或无法判定时不盲抢他人 daemon
    if (health.workspace && !sameWorkspacePath(health.workspace, workspace)) {
      continue;
    }
    const entry: DaemonRegistryEntry = {
      pid: existing?.pid && isPidAlive(existing.pid) ? existing.pid : 0,
      port,
      host: '127.0.0.1',
      workspace,
      startedAt: Date.now(),
    };
    writeDaemonRegistry(entry);
    return entry;
  }

  return null;
}
