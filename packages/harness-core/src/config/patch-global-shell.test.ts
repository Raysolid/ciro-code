import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('patchGlobalShellPath', () => {
  let home: string;
  let prevHome: string | undefined;
  let prevUserProfile: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ciro-shell-cfg-'));
    prevHome = process.env.HOME;
    prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    vi.resetModules();
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    rmSync(home, { recursive: true, force: true });
  });

  it('writes and clears shell.path in global config', async () => {
    const { patchGlobalShellPath } = await import('./patch-global-shell.js');
    const { globalConfigPath } = await import('../paths/product-paths.js');

    const set = patchGlobalShellPath('D:\\Git\\bin\\bash.exe');
    expect(set.path).toBe('D:\\Git\\bin\\bash.exe');
    const yaml = readFileSync(globalConfigPath(), 'utf-8');
    expect(yaml).toContain('shell:');
    expect(yaml).toContain('bash.exe');

    const cleared = patchGlobalShellPath(null);
    expect(cleared.path).toBeUndefined();
    const after = readFileSync(globalConfigPath(), 'utf-8');
    expect(after).not.toMatch(/shell:/);
  });
});
