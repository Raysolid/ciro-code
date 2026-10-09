import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  areasFromPorcelainCode,
  getGitCommit,
  getGitWorkingDiff,
  getWorkspaceGitStatus,
  gitCherryPick,
  gitCommit,
  gitCreateBranch,
  gitCreateTag,
  gitDiscard,
  gitStage,
  gitUnstage,
  listGitBranches,
  listGitLog,
} from './workspace-git.js';

function git(cwd: string, args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
}

describe('areasFromPorcelainCode', () => {
  it('classifies common codes', () => {
    expect(areasFromPorcelainCode('??')).toEqual(['untracked']);
    expect(areasFromPorcelainCode(' M')).toEqual(['unstaged']);
    expect(areasFromPorcelainCode('M ')).toEqual(['staged']);
    expect(areasFromPorcelainCode('MM')).toEqual(['staged', 'unstaged']);
    expect(areasFromPorcelainCode('UU')).toEqual(['unmerged']);
  });
});

describe('getWorkspaceGitStatus', () => {
  it('reports non-repo workspace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-git-none-'));
    const st = await getWorkspaceGitStatus(root);
    expect(st.isRepo).toBe(false);
    expect(st.entries).toEqual([]);
  });

  it('reports branch, dirty files, and area', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-git-repo-'));
    git(root, ['init']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    writeFileSync(join(root, 'a.txt'), 'one\n');
    git(root, ['add', 'a.txt']);
    git(root, ['commit', '-m', 'init']);
    writeFileSync(join(root, 'a.txt'), 'two\n');
    writeFileSync(join(root, 'b.txt'), 'new\n');

    const st = await getWorkspaceGitStatus(root);
    expect(st.isRepo).toBe(true);
    expect(st.dirty).toBe(true);
    expect(st.entries.some((e) => e.path === 'a.txt' && e.area === 'unstaged')).toBe(true);
    expect(st.entries.some((e) => e.path === 'b.txt' && e.area === 'untracked')).toBe(true);
  });
});

describe('listGitLog / getGitCommit / getGitWorkingDiff', () => {
  it('lists commits and working diff', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-git-log-'));
    git(root, ['init']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    writeFileSync(join(root, 'a.txt'), 'one\n');
    git(root, ['add', 'a.txt']);
    git(root, ['commit', '-m', 'first commit']);
    writeFileSync(join(root, 'a.txt'), 'two\n');

    const { commits, error } = await listGitLog(root, { limit: 10 });
    expect(error).toBeUndefined();
    expect(commits.length).toBeGreaterThanOrEqual(1);
    expect(commits[0]!.subject).toBe('first commit');

    const detail = await getGitCommit(root, commits[0]!.hash);
    expect(detail.commit?.files.some((f) => f.path === 'a.txt')).toBe(true);

    const diff = await getGitWorkingDiff(root, 'a.txt', 'worktree');
    expect(diff.error).toBeUndefined();
    expect(diff.unifiedDiff).toContain('+two');
  });
});

describe('gitStage / gitUnstage / gitDiscard / gitCommit', () => {
  it('stages, commits, and discards', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-git-write-'));
    git(root, ['init']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    writeFileSync(join(root, 'a.txt'), 'one\n');
    git(root, ['add', 'a.txt']);
    git(root, ['commit', '-m', 'init']);

    writeFileSync(join(root, 'a.txt'), 'two\n');
    writeFileSync(join(root, 'b.txt'), 'new\n');

    expect((await gitStage(root, ['a.txt', 'b.txt'])).ok).toBe(true);
    let st = await getWorkspaceGitStatus(root);
    expect(st.entries.some((e) => e.path === 'a.txt' && e.area === 'staged')).toBe(true);
    expect(st.entries.some((e) => e.path === 'b.txt' && e.area === 'staged')).toBe(true);

    expect((await gitUnstage(root, ['b.txt'])).ok).toBe(true);
    st = await getWorkspaceGitStatus(root);
    expect(st.entries.some((e) => e.path === 'b.txt' && e.area === 'untracked')).toBe(true);

    expect((await gitCommit(root, 'update a')).ok).toBe(true);
    st = await getWorkspaceGitStatus(root);
    expect(st.entries.some((e) => e.path === 'a.txt')).toBe(false);

    expect((await gitDiscard(root, ['b.txt'], 'untracked')).ok).toBe(true);
    st = await getWorkspaceGitStatus(root);
    expect(st.entries.some((e) => e.path === 'b.txt')).toBe(false);

    writeFileSync(join(root, 'a.txt'), 'three\n');
    expect((await gitDiscard(root, ['a.txt'], 'unstaged')).ok).toBe(true);
    st = await getWorkspaceGitStatus(root);
    expect(st.dirty).toBe(false);

    expect((await gitDiscard(root, ['a.txt'], 'unmerged')).ok).toBe(false);
    expect((await gitCommit(root, '')).ok).toBe(false);

    const { branches, error } = await listGitBranches(root);
    expect(error).toBeUndefined();
    expect(branches.some((b) => b.current)).toBe(true);
  });
});

describe('gitCreateBranch / gitCreateTag / gitCherryPick', () => {
  it('creates branch, tag, and cherry-picks', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-git-g3-'));
    git(root, ['init']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    // Normalize default branch name across git versions
    git(root, ['checkout', '-b', 'main']);
    writeFileSync(join(root, 'a.txt'), 'one\n');
    git(root, ['add', 'a.txt']);
    git(root, ['commit', '-m', 'init']);

    expect((await gitCreateBranch(root, 'feat/x')).ok).toBe(true);
    let st = await getWorkspaceGitStatus(root);
    expect(st.branch).toBe('feat/x');

    expect((await gitCreateBranch(root, '')).ok).toBe(false);
    expect((await gitCreateBranch(root, 'bad name')).ok).toBe(false);

    writeFileSync(join(root, 'a.txt'), 'two\n');
    git(root, ['add', 'a.txt']);
    git(root, ['commit', '-m', 'on feat']);
    const { commits } = await listGitLog(root, { limit: 5 });
    const featHash = commits[0]!.hash;

    expect((await gitCreateTag(root, 'v1.0.0', featHash)).ok).toBe(true);
    expect((await gitCreateTag(root, 'bad tag')).ok).toBe(false);
    expect((await gitCreateTag(root, 'v1.0.0', featHash)).ok).toBe(false);

    git(root, ['switch', 'main']);
    expect((await gitCherryPick(root, featHash)).ok).toBe(true);
    st = await getWorkspaceGitStatus(root);
    expect(st.dirty).toBe(false);
    expect((await gitCherryPick(root, 'notahash')).ok).toBe(false);
  });
});
