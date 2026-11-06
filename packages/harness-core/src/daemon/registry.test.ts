import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  daemonRegistryPath,
  findHealthyDaemon,
  workspaceDaemonHash,
  writeDaemonRegistry,
} from './registry.js';

describe('findHealthyDaemon', () => {
  const roots: string[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const r of roots) {
      try {
        rmSync(r, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    roots.length = 0;
  });

  it('reuses registry entry even when health.workspace was switched', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'ciro-ws-'));
    roots.push(ws);
    // homeRoot 由 product-paths 决定；这里直接写注册表路径对应内容不方便 stub home。
    // 改为 stub fetch：只要 registry 可读且 health ok 即可。
    // 用真实 home 下的临时 workspace 路径写注册表。
    writeDaemonRegistry({
      pid: process.pid,
      port: 5280,
      host: '127.0.0.1',
      workspace: ws,
      startedAt: Date.now(),
    });
    roots.push(daemonRegistryPath(ws)); // not a dir — cleanup via clear below

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: 'ok',
          // 当前选中工作区已切换，不得否定注册表亲和
          workspace: 'D:\\other\\switched',
        }),
      })),
    );

    const found = await findHealthyDaemon(ws, 500);
    expect(found?.port).toBe(5280);
    expect(workspaceDaemonHash(ws).length).toBe(16);

    // cleanup registry file
    try {
      rmSync(daemonRegistryPath(ws), { force: true });
    } catch {
      /* ignore */
    }
  });
});
