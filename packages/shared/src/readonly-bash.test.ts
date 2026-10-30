import { describe, expect, it } from 'vitest';
import {
  classifyBashForReadonlyMode,
  isMutatingBashCommand,
  isReadonlyBashCommand,
} from './readonly-bash.js';

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
    expect(isReadonlyBashCommand('cd src')).toBe(true);
    expect(isReadonlyBashCommand('echo hello')).toBe(true);
  });

  it('allows readonly chains, pipes, || fallbacks, and stderr discard redirects', () => {
    expect(isReadonlyBashCommand('git status && git log -1')).toBe(true);
    expect(isReadonlyBashCommand('git log -5; git status')).toBe(true);
    expect(isReadonlyBashCommand('git log -5 | head')).toBe(true);
    expect(isReadonlyBashCommand('Get-ChildItem | Select-Object -First 10')).toBe(true);
    expect(isReadonlyBashCommand('git status || git log')).toBe(true);
    expect(isReadonlyBashCommand('ls src 2>/dev/null || echo "(missing)"')).toBe(true);
    expect(isReadonlyBashCommand('git log -1 2>/dev/null')).toBe(true);
    expect(isReadonlyBashCommand('ls foo 2>NUL || echo no')).toBe(true);
  });

  it('allows typical ask-mode exploration one-liners (stderr + cd + echo + ||)', () => {
    const cmd =
      'cd /d/workspace/resume-agent 2>/dev/null || cd "D:/workspace/resume-agent"; ' +
      'echo "=== git log (last 15) ==="; git log --oneline -15 2>/dev/null; echo; ' +
      'echo "=== memory package? ==="; ' +
      'ls src/main/java/com/interviewer/memory 2>/dev/null || echo "(no memory package)"; echo; ' +
      'echo "=== schema ==="; ' +
      'grep -niE "chat_message|practice_session" src/main/resources/schema.sql | head -40';
    expect(classifyBashForReadonlyMode(cmd)).toBe('readonly');
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
    expect(isReadonlyBashCommand('git status && npm install')).toBe(false);
    expect(isReadonlyBashCommand('echo hi > file.txt')).toBe(false);
  });
});

describe('classifyBashForReadonlyMode', () => {
  it('marks mutating writes as mutating', () => {
    expect(classifyBashForReadonlyMode('npm install')).toBe('mutating');
    expect(classifyBashForReadonlyMode('git commit -am x')).toBe('mutating');
    expect(classifyBashForReadonlyMode('git push')).toBe('mutating');
    expect(classifyBashForReadonlyMode('rm -rf src')).toBe('mutating');
    expect(classifyBashForReadonlyMode('ls > out.txt')).toBe('mutating');
    expect(classifyBashForReadonlyMode('cat a | tee b')).toBe('mutating');
    expect(classifyBashForReadonlyMode('git status && npm install')).toBe('mutating');
    expect(isMutatingBashCommand('Remove-Item -Recurse tmp')).toBe(true);
    expect(classifyBashForReadonlyMode('find . -delete')).toBe('mutating');
  });

  it('marks unknown non-mutating commands as other', () => {
    expect(classifyBashForReadonlyMode('pnpm test')).toBe('other');
    expect(classifyBashForReadonlyMode('git')).toBe('other');
    expect(classifyBashForReadonlyMode('if exist game (dir game)')).toBe('other');
    expect(classifyBashForReadonlyMode('python -c "print(1)"')).toBe('other');
  });
});
