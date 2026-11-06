import { afterEach, describe, expect, it } from 'vitest';
import {
  applyShellConfigOverride,
  clearResolvedShellCache,
} from '@ciro-code/harness-core';
import { createSandboxedBashTool } from './bash-tool.js';

describe('createSandboxedBashTool description hot update', () => {
  const prevEnv = process.env.CIRO_SHELL_PATH;

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.CIRO_SHELL_PATH;
    else process.env.CIRO_SHELL_PATH = prevEnv;
    applyShellConfigOverride(undefined);
    clearResolvedShellCache();
  });

  it('exposes description as a live getter', () => {
    const tool = createSandboxedBashTool('/tmp/ws');
    const desc = Object.getOwnPropertyDescriptor(tool, 'description');
    expect(desc?.get).toBeTypeOf('function');
    expect(tool.description).toMatch(/Current shell:/);
  });

  it('recomputes hint after CIRO_SHELL_PATH change + cache clear', () => {
    delete process.env.CIRO_SHELL_PATH;
    applyShellConfigOverride(undefined);
    clearResolvedShellCache();
    const tool = createSandboxedBashTool('/tmp/ws');
    const beforePath = /at `([^`]+)`/.exec(tool.description)?.[1];

    // Prefer a different fixed shell that exists on this OS
    const alt =
      process.platform === 'win32'
        ? process.env.SystemRoot
          ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
          : 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
        : '/bin/sh';

    process.env.CIRO_SHELL_PATH = alt;
    clearResolvedShellCache();
    const after = tool.description;
    expect(after).toMatch(/Current shell:/);
    if (beforePath && beforePath !== alt) {
      expect(after).toContain(alt);
      expect(after).not.toContain(`at \`${beforePath}\``);
    }
  });
});
