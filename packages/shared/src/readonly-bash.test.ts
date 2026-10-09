import { describe, expect, it } from 'vitest';
import { isReadonlyBashCommand } from './readonly-bash.js';

describe('isReadonlyBashCommand', () => {
  it('allows common readonly commands', () => {
    expect(isReadonlyBashCommand('git status')).toBe(true);
    expect(isReadonlyBashCommand('git log -1')).toBe(true);
    expect(isReadonlyBashCommand('git diff HEAD')).toBe(true);
    expect(isReadonlyBashCommand('git blame src/a.ts')).toBe(true);
    expect(isReadonlyBashCommand('git ls-files')).toBe(true);
    expect(isReadonlyBashCommand('git rev-parse --show-toplevel')).toBe(true);
    expect(isReadonlyBashCommand('git stash list')).toBe(true);
    expect(isReadonlyBashCommand('git branch')).toBe(true);
    expect(isReadonlyBashCommand('git branch -av')).toBe(true);
    expect(isReadonlyBashCommand('git remote -v')).toBe(true);
    expect(isReadonlyBashCommand('ls -la')).toBe(true);
    expect(isReadonlyBashCommand('rg TODO src')).toBe(true);
    expect(isReadonlyBashCommand('cat package.json')).toBe(true);
    expect(isReadonlyBashCommand('Get-ChildItem')).toBe(true);
  });

  it('allows readonly chains and pipes when every segment is allowed', () => {
    expect(isReadonlyBashCommand('git status && git log -1')).toBe(true);
    expect(isReadonlyBashCommand('git log -5; git status')).toBe(true);
    expect(isReadonlyBashCommand('git log -5 | head')).toBe(true);
    expect(isReadonlyBashCommand('Get-ChildItem | Select-Object -First 10')).toBe(true);
  });

  it('denies bare git and mutating or unsafe commands', () => {
    expect(isReadonlyBashCommand('git')).toBe(false);
    expect(isReadonlyBashCommand('npm install')).toBe(false);
    expect(isReadonlyBashCommand('git commit -am x')).toBe(false);
    expect(isReadonlyBashCommand('git push')).toBe(false);
    expect(isReadonlyBashCommand('git stash')).toBe(false);
    expect(isReadonlyBashCommand('git remote add origin x')).toBe(false);
    expect(isReadonlyBashCommand('git branch foo')).toBe(false);
    expect(isReadonlyBashCommand('git branch -d x')).toBe(false);
    expect(isReadonlyBashCommand('git remote update')).toBe(false);
    expect(isReadonlyBashCommand('rm -rf /')).toBe(false);
    expect(isReadonlyBashCommand('cat a | tee b')).toBe(false);
    expect(isReadonlyBashCommand('ls > out.txt')).toBe(false);
    expect(isReadonlyBashCommand('git status || git log')).toBe(false);
    expect(isReadonlyBashCommand('git status && npm install')).toBe(false);
  });
});
