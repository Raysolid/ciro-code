import { describe, expect, it } from 'vitest';
import {
  applyShellConfigOverride,
  clearResolvedShellCache,
  formatShellToolHint,
  isAppExecutionAliasPath,
  isWslBashPath,
  kindFromShellPath,
  resolveShellWithDeps,
  shellSpawnArgs,
  validateShellPath,
} from './resolve-shell.js';

describe('isWslBashPath', () => {
  it('detects System32 and Sysnative bash', () => {
    expect(isWslBashPath('C:\\Windows\\System32\\bash.exe')).toBe(true);
    expect(isWslBashPath('C:/Windows/Sysnative/bash.exe')).toBe(true);
    expect(isWslBashPath('C:\\Program Files\\Git\\bin\\bash.exe')).toBe(false);
  });
});

describe('isAppExecutionAliasPath', () => {
  it('detects Local WindowsApps stubs', () => {
    expect(
      isAppExecutionAliasPath(
        'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe',
      ),
    ).toBe(true);
    expect(isAppExecutionAliasPath('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe(
      false,
    );
  });
});

describe('kindFromShellPath', () => {
  it('maps common basenames', () => {
    expect(kindFromShellPath('C:\\Git\\bin\\bash.exe')).toBe('bash');
    expect(kindFromShellPath('/usr/bin/pwsh')).toBe('pwsh');
    expect(kindFromShellPath('powershell.exe')).toBe('powershell');
    expect(kindFromShellPath('/bin/sh')).toBe('sh');
  });
});

describe('validateShellPath', () => {
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  const wslBash = 'C:\\Windows\\System32\\bash.exe';
  const alias =
    'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe';

  it('accepts real Git Bash', () => {
    const r = validateShellPath(gitBash, {
      exists: (p) => p === gitBash,
      probeVersion: () => '5.2.26',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shell.path).toBe(gitBash);
      expect(r.shell.kind).toBe('bash');
    }
  });

  it('rejects WSL bash', () => {
    const r = validateShellPath(wslBash, {
      exists: () => true,
      probeVersion: () => '5.0.0',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/WSL/i);
  });

  it('rejects App Execution Alias', () => {
    const r = validateShellPath(alias, {
      exists: () => true,
      probeVersion: () => '7.4.0',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/WindowsApps|alias/i);
  });

  it('rejects relative paths', () => {
    const r = validateShellPath('bash.exe', {
      exists: () => true,
      probeVersion: () => '5.0.0',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/absolute/i);
  });
});

describe('resolveShellWithDeps', () => {
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  const wslBash = 'C:\\Windows\\System32\\bash.exe';
  const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const ps51 = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  const customBash = 'D:\\develop\\Git\\bin\\bash.exe';
  const winEnv = {
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    SystemRoot: 'C:\\Windows',
  };

  it('prefers Git Bash under Program Files', () => {
    const shell = resolveShellWithDeps({
      platform: 'win32',
      env: winEnv,
      exists: (p) => p === gitBash || p === ps51,
      probeVersion: (p) => (p === gitBash ? '5.2.26' : '5.1.22621'),
    });
    expect(shell.kind).toBe('bash');
    expect(shell.path).toBe(gitBash);
    expect(shell.label).toContain('Git Bash');
    expect(shell.versionLabel).toBe('5.2.26');
  });

  it('skips WSL System32 bash and falls back to fixed pwsh', () => {
    const shell = resolveShellWithDeps({
      platform: 'win32',
      env: winEnv,
      exists: (p) => p === wslBash || p === pwsh || p === ps51,
      probeVersion: (p, kind) => {
        if (p === wslBash) return '5.0.0';
        if (kind === 'pwsh') return '7.4.6';
        return '5.1.0';
      },
    });
    expect(shell.kind).toBe('pwsh');
    expect(shell.path).toBe(pwsh);
  });

  it('does not find custom Git install without explicit override', () => {
    const shell = resolveShellWithDeps({
      platform: 'win32',
      env: winEnv,
      exists: (p) => p === customBash || p === ps51,
      probeVersion: (p) => (p === customBash ? '5.2.12' : '5.1.0'),
    });
    expect(shell.path).toBe(ps51);
    expect(shell.kind).toBe('powershell');
  });

  it('honors CIRO_SHELL_PATH over config and fixed probe', () => {
    const shell = resolveShellWithDeps({
      platform: 'win32',
      env: { ...winEnv, CIRO_SHELL_PATH: pwsh },
      configShellPath: gitBash,
      exists: (p) => p === pwsh || p === gitBash,
      probeVersion: () => '7.4.6',
    });
    expect(shell.path).toBe(pwsh);
    expect(shell.kind).toBe('pwsh');
  });

  it('honors configShellPath over fixed probe', () => {
    const shell = resolveShellWithDeps({
      platform: 'win32',
      env: winEnv,
      configShellPath: customBash,
      exists: (p) => p === customBash || p === gitBash || p === ps51,
      probeVersion: (p) => (p === customBash ? '5.2.12' : '5.2.26'),
    });
    expect(shell.path).toBe(customBash);
    expect(shell.kind).toBe('bash');
  });

  it('falls back to Windows PowerShell 5.1', () => {
    const shell = resolveShellWithDeps({
      platform: 'win32',
      env: winEnv,
      exists: (p) => p === ps51,
      probeVersion: () => '5.1.22621.2506',
    });
    expect(shell.kind).toBe('powershell');
    expect(shell.path).toBe(ps51);
    expect(shell.label).toContain('Windows PowerShell');
  });

  it('uses SHELL on posix', () => {
    const shell = resolveShellWithDeps({
      platform: 'linux',
      env: { SHELL: '/bin/bash' },
      exists: (p) => p === '/bin/bash',
      probeVersion: () => '5.1.16',
    });
    expect(shell.kind).toBe('bash');
    expect(shell.path).toBe('/bin/bash');
  });

  it('uses fixed /bin/bash when SHELL unset', () => {
    const shell = resolveShellWithDeps({
      platform: 'linux',
      env: {},
      exists: (p) => p === '/bin/bash',
      probeVersion: () => '5.2.0',
    });
    expect(shell.path).toBe('/bin/bash');
  });
});

describe('applyShellConfigOverride', () => {
  it('is idempotent when path unchanged', () => {
    applyShellConfigOverride('D:\\Git\\bin\\bash.exe');
    applyShellConfigOverride('D:\\Git\\bin\\bash.exe');
    applyShellConfigOverride('');
    applyShellConfigOverride(undefined);
    clearResolvedShellCache();
  });
});

describe('formatShellToolHint / shellSpawnArgs', () => {
  it('hints posix for bash and builds -lc args', () => {
    const shell = {
      kind: 'bash' as const,
      path: 'C:\\Program Files\\Git\\bin\\bash.exe',
      versionLabel: '5.2.26',
      label: 'Git Bash 5.2.26',
    };
    expect(formatShellToolHint(shell)).toMatch(/POSIX\/bash/);
    expect(formatShellToolHint(shell)).toContain(shell.path);
    expect(shellSpawnArgs(shell, 'echo hi')).toEqual({
      command: shell.path,
      args: ['-lc', 'echo hi'],
    });
  });

  it('hints PowerShell and builds -Command args', () => {
    const shell = {
      kind: 'pwsh' as const,
      path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      versionLabel: '7.4.6',
      label: 'PowerShell 7.4.6',
    };
    expect(formatShellToolHint(shell)).toMatch(/Write PowerShell/);
    expect(shellSpawnArgs(shell, 'echo hi').args).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-Command',
      'echo hi',
    ]);
  });
});
