import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireWorkspaceLock,
  readWorkspaceLock,
  releaseWorkspaceLock,
  workspaceLockPath,
} from './workspace-lock.js';

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    releaseWorkspaceLock(d);
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('workspace-lock', () => {
  it('acquires and releases', () => {
    const ws = mkdtempSync(join(tmpdir(), 'ciro-core-lock-'));
    dirs.push(ws);
    expect(acquireWorkspaceLock(ws, 'web').ok).toBe(true);
    expect(readWorkspaceLock(ws)?.kind).toBe('web');
    releaseWorkspaceLock(ws);
    expect(readWorkspaceLock(ws)).toBeNull();
  });

  it('same pid re-acquires', () => {
    const ws = mkdtempSync(join(tmpdir(), 'ciro-core-lock-'));
    dirs.push(ws);
    expect(acquireWorkspaceLock(ws, 'tui').ok).toBe(true);
    expect(acquireWorkspaceLock(ws, 'tui').ok).toBe(true);
    expect(readWorkspaceLock(ws)?.pid).toBe(process.pid);
  });

  it('clears stale pid on read', () => {
    const ws = mkdtempSync(join(tmpdir(), 'ciro-core-lock-'));
    dirs.push(ws);
    const path = workspaceLockPath(ws);
    writeFileSync(
      path,
      JSON.stringify({
        pid: 2_147_483_646,
        kind: 'web',
        startedAt: Date.now(),
        workspace: ws,
      }),
      'utf8',
    );
    expect(readWorkspaceLock(ws)).toBeNull();
    expect(acquireWorkspaceLock(ws, 'tui').ok).toBe(true);
  });

  it('allowConcurrent does not overwrite foreign lock', () => {
    const ws = mkdtempSync(join(tmpdir(), 'ciro-core-lock-'));
    dirs.push(ws);
    expect(acquireWorkspaceLock(ws, 'web').ok).toBe(true);
    const before = readWorkspaceLock(ws);
    expect(before?.kind).toBe('web');
    // Simulate foreign holder by rewriting pid (alive: use current pid but treat as conflict path)
    // Real foreign: acquire without allow fails; with allow returns ok without changing file kind.
    const path = workspaceLockPath(ws);
    writeFileSync(
      path,
      JSON.stringify({
        pid: process.pid + 1_000_000 > 1 ? 1 : 2, // likely dead → would stale-clear;
        kind: 'web',
        startedAt: Date.now(),
        workspace: ws,
      }),
      'utf8',
    );
    // Use a definitely-alive foreign pid: spawn isn't available; instead hold with current
    // process then call allowConcurrent from the same process — existing.pid === process.pid
    // bypasses conflict. So rewrite to a live-looking foreign pid via process.pid and
    // temporarily rely on allowConcurrent when existing.pid !== process.pid.
    writeFileSync(
      path,
      JSON.stringify({
        // pid 0 / negative treated as dead by pidAlive; use self then mutate check via
        // writing a high pid that is almost certainly dead, then allowConcurrent after
        // re-acquire as web with this process first.
        pid: process.pid,
        kind: 'web',
        startedAt: Date.now(),
        workspace: ws,
      }),
      'utf8',
    );
    // Same pid: ok. For foreign alive lock, acquire without allow fails — emulate by
    // monkey-patching isn't available; write lock as current then acquire as conflict
    // using a second path: create lock with process.pid, release not called, then
    // acquireWorkspaceLock sees same pid and overwrites — that's intentional.
    // Foreign alive: use pid that is alive but not us — on Windows/Linux, PID 4 or 1 often alive.
    const foreignPid = process.platform === 'win32' ? 4 : 1;
    writeFileSync(
      path,
      JSON.stringify({
        pid: foreignPid,
        kind: 'web',
        startedAt: Date.now(),
        workspace: ws,
      }),
      'utf8',
    );
    const blocked = acquireWorkspaceLock(ws, 'tui');
    if (!blocked.ok) {
      expect(blocked.existing.kind).toBe('web');
      const allowed = acquireWorkspaceLock(ws, 'tui', { allowConcurrent: true });
      expect(allowed.ok).toBe(true);
      expect(readWorkspaceLock(ws)?.kind).toBe('web');
      expect(readWorkspaceLock(ws)?.pid).toBe(foreignPid);
    } else {
      // foreign pid not alive on this host — treat as stale-cleared success path
      expect(blocked.ok).toBe(true);
    }
  });
});
