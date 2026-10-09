import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadConfig, PackStore, SessionStore } from '@ciro/harness-core';
import { createHarnessApp } from './app.js';

function git(cwd: string, args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
}

function installGitPack(packsRoot: string) {
  const installPath = join(packsRoot, 'modules', '@ciro', 'ext-git');
  mkdirSync(installPath, { recursive: true });
  writeFileSync(
    join(installPath, 'ciro.pack.json'),
    JSON.stringify({
      id: '@ciro/ext-git',
      displayName: 'Git',
      version: '0.1.0',
      engines: { ciro: '>=0.1.0' },
      contributions: { sidePanels: [{ id: 'git', label: 'Git' }] },
    }),
    'utf-8',
  );
}

describe('git write routes (G2)', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-git-g2-'));
  const packsRoot = mkdtempSync(join(tmpdir(), 'harness-git-packs-'));
  git(workspace, ['init']);
  git(workspace, ['config', 'user.email', 'test@example.com']);
  git(workspace, ['config', 'user.name', 'Test']);
  writeFileSync(join(workspace, 'a.txt'), 'one\n');
  git(workspace, ['add', 'a.txt']);
  git(workspace, ['commit', '-m', 'init']);

  installGitPack(packsRoot);
  const packStore = new PackStore({ packsRoot });
  packStore.ensureLayout();

  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'agent',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot: join(workspace, 'sessions') });
  const app = createHarnessApp({ config, sessionStore, packStore });

  it('Pack off → write API 403', async () => {
    const res = await app.request('/api/v1/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: ['a.txt'] }),
    });
    expect(res.status).toBe(403);
  });

  it('Pack on → stage / commit / push confirmation gate', async () => {
    packStore.setEnabled('@ciro/ext-git', true);
    writeFileSync(join(workspace, 'a.txt'), 'two\n');

    const stageRes = await app.request('/api/v1/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: ['a.txt'] }),
    });
    if (stageRes.status !== 200) {
      throw new Error(`stage ${stageRes.status}: ${await stageRes.text()}`);
    }
    expect(stageRes.status).toBe(200);

    const commitDeny = await app.request('/api/v1/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'update' }),
    });
    expect(commitDeny.status).toBe(403);

    const commitOk = await app.request('/api/v1/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'update', confirmed: true }),
    });
    expect(commitOk.status).toBe(200);

    const pushDeny = await app.request('/api/v1/git/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(pushDeny.status).toBe(403);
    const pushBody = (await pushDeny.json()) as { requiresConfirmation?: boolean };
    expect(pushBody.requiresConfirmation).toBe(true);

    const statusRes = await app.request('/api/v1/git/status');
    expect(statusRes.status).toBe(200);
    const status = (await statusRes.json()) as {
      entries: Array<{ path: string }>;
    };
    expect(status.entries.some((e) => e.path === 'a.txt')).toBe(false);

    const branchesRes = await app.request('/api/v1/git/branches');
    expect(branchesRes.status).toBe(200);
    const branches = (await branchesRes.json()) as { branches: Array<{ name: string }> };
    expect(branches.branches.length).toBeGreaterThan(0);
  });
});
