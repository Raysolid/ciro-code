import { describe, expect, it } from 'vitest';
import {
  classifyBashForReadonlyMode,
  classifyBashForReadonlyModeDetailed,
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

  it('allows Windows findstr; PS $() not hard-denied; ForEach-Object asks', () => {
    expect(
      classifyBashForReadonlyMode(
        'findstr /n /i "pack extension" "D:\\workspace\\doc.md"',
      ),
    ).toBe('readonly');
    const ps =
      'powershell -NoProfile -Command "Select-String -Path \'x.md\' -Pattern \'pack\' | Select-Object -First 80 | ForEach-Object { \\"$($_.LineNumber): $($_.Line)\\" }"';
    expect(classifyBashForReadonlyMode(ps)).toBe('other');
    expect(
      classifyBashForReadonlyMode(
        'powershell -NoProfile -Command "Select-String -Path \'x.md\' -Pattern \'pack\'"',
      ),
    ).toBe('readonly');
    expect(
      classifyBashForReadonlyMode(
        'powershell -NoProfile -Command "Remove-Item -Recurse tmp"',
      ),
    ).toBe('mutating');
  });

  it('treats Windows cmd & as chain (not background mutating)', () => {
    expect(
      classifyBashForReadonlyMode(
        'dir ..\\backend\\src\\main\\java\\com\\ciro\\chat\\tool & echo --- & dir ..\\backend\\src\\main\\java\\com\\ciro\\chat\\advisor',
      ),
    ).toBe('readonly');
    expect(classifyBashForReadonlyMode('dir src & npm install')).toBe('mutating');
    expect(classifyBashForReadonlyMode('pnpm test & echo done')).toBe('other');
    expect(classifyBashForReadonlyMode('sleep 10 &')).toBe('mutating');
  });
});

describe('Phase A–B optimizations', () => {
  it('cmd substitution and newlines are other (not mutating)', () => {
    expect(classifyBashForReadonlyMode('echo $(date)')).toBe('other');
    expect(classifyBashForReadonlyModeDetailed('echo $(date)').reason).toBe(
      'cmd_substitution',
    );
    expect(classifyBashForReadonlyMode('echo `date`')).toBe('other');
    expect(classifyBashForReadonlyMode('echo hello\necho world')).toBe('other');
    // 单引号内字面量不算替换
    expect(classifyBashForReadonlyMode("echo '$(date)'")).toBe('readonly');
  });

  it('normalizes git globals and safe env prefixes', () => {
    expect(classifyBashForReadonlyMode('git --no-pager log -1')).toBe('readonly');
    expect(classifyBashForReadonlyMode('git -C /tmp/repo status')).toBe('readonly');
    expect(classifyBashForReadonlyMode('FOO=1 git status')).toBe('readonly');
    expect(classifyBashForReadonlyMode('FOO=1 BAR=2 git log -1')).toBe('readonly');
  });

  it('dangerous env and git -c → other', () => {
    expect(classifyBashForReadonlyMode('LD_PRELOAD=x git status')).toBe('other');
    expect(classifyBashForReadonlyModeDetailed('LD_PRELOAD=x git status').reason).toBe(
      'dangerous_env',
    );
    expect(classifyBashForReadonlyMode('git -c alias.x=!cmd status')).toBe('other');
    expect(classifyBashForReadonlyModeDetailed('git -c foo=bar status').reason).toBe(
      'git_config_flag',
    );
  });

  it('git branch/remote/config/stash/tag parameter-level', () => {
    expect(classifyBashForReadonlyMode('git branch --contains abc')).toBe('readonly');
    expect(classifyBashForReadonlyMode('git branch --show-current')).toBe('readonly');
    expect(classifyBashForReadonlyMode('git branch --merged')).toBe('readonly');
    expect(classifyBashForReadonlyMode('git branch -d x')).toBe('mutating');
    expect(classifyBashForReadonlyMode('git branch foo')).toBe('mutating');
    expect(classifyBashForReadonlyMode('git fetch')).toBe('other');
    expect(classifyBashForReadonlyModeDetailed('git fetch origin').reason).toBe('git_fetch');
    expect(classifyBashForReadonlyMode('git pull')).toBe('mutating');
    expect(classifyBashForReadonlyMode('git tag')).toBe('readonly');
    expect(classifyBashForReadonlyMode('git tag -l')).toBe('readonly');
    expect(classifyBashForReadonlyMode('git tag v1.0')).toBe('mutating');
    expect(classifyBashForReadonlyMode('git ls-tree HEAD')).toBe('readonly');
  });

  it('rg pipe alternation in quotes stays readonly', () => {
    expect(classifyBashForReadonlyMode('rg "a|b" src')).toBe('readonly');
    expect(classifyBashForReadonlyMode('echo "a > b"')).toBe('readonly');
  });
});

describe('Phase D wrappers and allowlist', () => {
  it('expands readonly allowlist', () => {
    expect(classifyBashForReadonlyMode('sort file.txt')).toBe('readonly');
    expect(classifyBashForReadonlyMode('uniq -c')).toBe('readonly');
    expect(classifyBashForReadonlyMode('date')).toBe('readonly');
    expect(classifyBashForReadonlyMode('stat package.json')).toBe('readonly');
    expect(classifyBashForReadonlyMode('df -h')).toBe('readonly');
  });

  it('dangerous args stay mutating', () => {
    expect(classifyBashForReadonlyMode('sort -o out.txt in.txt')).toBe('mutating');
    expect(classifyBashForReadonlyMode('rg --pre cat pattern')).toBe('mutating');
    expect(classifyBashForReadonlyMode('find . -fprint out.txt')).toBe('mutating');
  });

  it('unwraps timeout/time and bash -c', () => {
    expect(classifyBashForReadonlyMode('timeout 5 git status')).toBe('readonly');
    expect(classifyBashForReadonlyMode('time git log -1')).toBe('readonly');
    expect(classifyBashForReadonlyMode('bash -c "git status"')).toBe('readonly');
    expect(classifyBashForReadonlyMode('bash -c "npm install"')).toBe('mutating');
    expect(classifyBashForReadonlyMode('env git status')).toBe('readonly');
  });
});
