import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadConfig, PackStore, SessionStore } from '@ciro-code/harness-core';
import { createHarnessApp } from './app.js';

function git(cwd: string, args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
}

function installGitPack(packsRoot: string) {
  const installPath = join(packsRoot, 'modules', '@ciro-code', 'ext-git');
  mkdirSync(installPath, { recursive: true });
  writeFileSync(
    join(installPath, 'ciro.pack.json'),
    JSON.stringify({
      id: '@ciro-code/ext-git',
      displayName: 'Git',
      version: '0.1.0',
      engines: { ciro: '>=0.1.0' },
      contributions: { sidePanels: [{ id: 'git', label: 'Git' }] },
    }),
    'utf-8',
  );
}

describe('git write routes (G3)', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-git-g3-'));
  const packsRoot = mkdtempSync(join(tmpdir(), 'harness-git-packs-g3-'));
  git(workspace, ['init']);
  git(workspace, ['checkout', '-b', 'main']);
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

  it('Pack off → G3 write API 403', async () => {
    const res = await app.request('/api/v1/git/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'feat/off' }),
    });
    expect(res.status).toBe(403);
  });

  it('Pack on → branch / tag / cherry-pick confirmation gate', async () => {
    packStore.setEnabled('@ciro-code/ext-git', true);

    const branchRes = await app.request('/api/v1/git/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'feat/g3' }),
    });
    if (branchRes.status !== 200) {
      throw new Error(`branch ${branchRes.status}: ${await branchRes.text()}`);
    }
    expect(branchRes.status).toBe(200);

    writeFileSync(join(workspace, 'a.txt'), 'two\n');
    git(workspace, ['add', 'a.txt']);
    git(workspace, ['commit', '-m', 'on feat']);
    const log = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: workspace,
      encoding: 'utf8',
      windowsHide: true,
    });
    const hash = log.stdout.trim();

    const tagRes = await app.request('/api/v1/git/tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'v0.1.0-g3', hash }),
    });
    expect(tagRes.status).toBe(200);

    git(workspace, ['switch', 'main']);

    const deny = await app.request('/api/v1/git/cherry-pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    });
    expect(deny.status).toBe(403);
    const denyBody = (await deny.json()) as { requiresConfirmation?: boolean };
    expect(denyBody.requiresConfirmation).toBe(true);

    const ok = await app.request('/api/v1/git/cherry-pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, confirmed: true }),
    });
    if (ok.status !== 200) {
      throw new Error(`cherry-pick ${ok.status}: ${await ok.text()}`);
    }
    expect(ok.status).toBe(200);

    const statusRes = await app.request('/api/v1/git/status');
    expect(statusRes.status).toBe(200);
    const status = (await statusRes.json()) as {
      branch: string;
      entries: Array<{ path: string }>;
    };
    expect(status.branch).toBe('main');
    expect(status.entries.some((e) => e.path === 'a.txt')).toBe(false);

    const content = spawnSync('git', ['show', 'HEAD:a.txt'], {
      cwd: workspace,
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(content.stdout).toBe('two\n');
  });
});
