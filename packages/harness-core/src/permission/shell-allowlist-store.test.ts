import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  normalizeShellCommand,
  ShellAllowlistStore,
} from './shell-allowlist-store.js';

describe('normalizeShellCommand', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeShellCommand('  git   status\n')).toBe('git status');
  });
});

describe('ShellAllowlistStore', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function store(): ShellAllowlistStore {
    const dir = mkdtempSync(join(tmpdir(), 'ciro-allowlist-'));
    dirs.push(dir);
    return new ShellAllowlistStore({ path: join(dir, 'shell-allowlist.json') });
  }

  it('adds matches and persists across instances', () => {
    const a = store();
    expect(a.add('  git status  ')).toBe(true);
    expect(a.add('git status')).toBe(false);
    expect(a.matches('git   status')).toBe(true);
    expect(a.list()).toEqual(['git status']);

    const b = new ShellAllowlistStore({ path: a.path });
    expect(b.matches('git status')).toBe(true);
  });

  it('remove and clear', () => {
    const s = store();
    s.add('ls');
    s.add('pwd');
    expect(s.remove('ls')).toBe(true);
    expect(s.list()).toEqual(['pwd']);
    s.clear();
    expect(s.list()).toEqual([]);
    expect(s.matches('pwd')).toBe(false);
  });

  it('setAll replaces', () => {
    const s = store();
    s.add('old');
    expect(s.setAll(['a', ' a ', '', 'b'])).toEqual(['a', 'b']);
  });
});
