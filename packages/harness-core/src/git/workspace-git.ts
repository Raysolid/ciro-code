import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  GitBranchSummary,
  GitCommitDetail,
  GitCommitFile,
  GitCommitSummary,
  GitDiffPayload,
  GitDiffSide,
  GitFileArea,
  GitFileStatus,
  GitWorkspaceStatus,
  GitWriteResult,
} from '@ciro-code/harness-shared';
import { decodeShellBuffer } from '../sandbox/sandboxed-executor.js';

/** 与会话 unified diff 同量级，禁止无限吐盘 */
const MAX_DIFF_CHARS = 48_000;
const REMOTE_TIMEOUT_MS = 120_000;

function runGit(cwd: string, args: string[], timeoutMs = 15_000): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  return new Promise((resolvePromise) => {
    const child = spawn('git', args, {
      cwd: resolve(cwd),
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout?.on('data', (c: Buffer) => out.push(c));
    child.stderr?.on('data', (c: Buffer) => err.push(c));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        stdout: '',
        stderr: e.message,
        exitCode: null,
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        stdout: decodeShellBuffer(Buffer.concat(out)),
        stderr: decodeShellBuffer(Buffer.concat(err)),
        exitCode: code,
      });
    });
  });
}

function isUnmergedCode(code: string): boolean {
  if (code.includes('U')) return true;
  return code === 'DD' || code === 'AA' || code === 'AU' || code === 'UA' || code === 'DU' || code === 'UD';
}

/** 由 porcelain XY 推导分区；MM 等可同时属于 staged+unstaged */
export function areasFromPorcelainCode(code: string): GitFileArea[] {
  if (code === '??' || code === '!!') return ['untracked'];
  if (isUnmergedCode(code)) return ['unmerged'];
  const x = code[0] ?? ' ';
  const y = code[1] ?? ' ';
  const areas: GitFileArea[] = [];
  if (x !== ' ' && x !== '?') areas.push('staged');
  if (y !== ' ' && y !== '?') areas.push('unstaged');
  if (areas.length === 0) areas.push('unstaged');
  return areas;
}

function truncateDiff(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_DIFF_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, MAX_DIFF_CHARS) + '\n... (diff truncated)\n',
    truncated: true,
  };
}

function parsePorcelain(stdout: string): { shortStatus: string | null; entries: GitFileStatus[] } {
  const lines = stdout.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { shortStatus: null, entries: [] };
  const shortStatus = lines[0]?.startsWith('##') ? lines[0].slice(3).trim() : null;
  const entries: GitFileStatus[] = [];
  for (const line of lines) {
    if (line.startsWith('##')) continue;
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    let path = line.slice(3);
    const arrow = path.indexOf(' -> ');
    if (arrow >= 0) path = path.slice(arrow + 4);
    for (const area of areasFromPorcelainCode(code)) {
      entries.push({ code, path, area });
    }
  }
  return { shortStatus, entries };
}

function parseAheadBehind(shortStatus: string | null): {
  ahead: number;
  behind: number;
  branch: string | null;
  upstream: string | null;
} {
  if (!shortStatus) {
    return { ahead: 0, behind: 0, branch: null, upstream: null };
  }
  const branchPart = shortStatus.split(/\s+\[/)[0] ?? shortStatus;
  let branch: string | null = branchPart;
  let upstream: string | null = null;
  const dots = branchPart.indexOf('...');
  if (dots >= 0) {
    branch = branchPart.slice(0, dots) || null;
    upstream = branchPart.slice(dots + 3) || null;
  }
  let ahead = 0;
  let behind = 0;
  const aheadM = shortStatus.match(/ahead\s+(\d+)/i);
  const behindM = shortStatus.match(/behind\s+(\d+)/i);
  if (aheadM) ahead = Number(aheadM[1]) || 0;
  if (behindM) behind = Number(behindM[1]) || 0;
  return { ahead, behind, branch, upstream };
}

async function assertRepo(workspace: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const inside = await runGit(workspace, ['rev-parse', '--is-inside-work-tree']);
  if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') {
    return { ok: false, error: inside.stderr.trim() || 'Not a git repository' };
  }
  return { ok: true };
}

/** 只读：workspace 的 git status（porcelain -sb） */
export async function getWorkspaceGitStatus(workspace: string): Promise<GitWorkspaceStatus> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) {
    return {
      isRepo: false,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      dirty: false,
      entries: [],
      shortStatus: null,
      error: repo.error,
    };
  }

  const status = await runGit(workspace, ['status', '-sb', '--porcelain=v1']);
  if (status.exitCode !== 0) {
    return {
      isRepo: true,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      dirty: false,
      entries: [],
      shortStatus: null,
      error: status.stderr.trim() || 'git status failed',
    };
  }

  const { shortStatus, entries } = parsePorcelain(status.stdout);
  const { ahead, behind, branch, upstream } = parseAheadBehind(shortStatus);

  const [unstagedStat, stagedStat] = await Promise.all([
    runGit(workspace, ['diff', '--numstat']),
    runGit(workspace, ['diff', '--cached', '--numstat']),
  ]);
  const unstagedMap = parseNumstat(unstagedStat.stdout);
  const stagedMap = parseNumstat(stagedStat.stdout);
  for (const e of entries) {
    const map = e.area === 'staged' ? stagedMap : unstagedMap;
    const n = map.get(e.path);
    if (n) {
      e.additions = n.additions;
      e.deletions = n.deletions;
    }
  }

  const uniquePaths = new Set(entries.map((e) => e.path));
  return {
    isRepo: true,
    branch,
    upstream,
    ahead,
    behind,
    dirty: uniquePaths.size > 0,
    entries,
    shortStatus,
  };
}

function parseNumstat(stdout: string): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const [addStr, delStr, pathRaw] = cols;
    let path = pathRaw ?? '';
    const arrow = path.indexOf(' => ');
    if (arrow >= 0) path = path.slice(arrow + 4).replace(/[{}]/g, '');
    map.set(path, {
      additions: addStr === '-' ? 0 : Number(addStr) || 0,
      deletions: delStr === '-' ? 0 : Number(delStr) || 0,
    });
  }
  return map;
}

function parseLogLine(line: string): GitCommitSummary | null {
  const parts = line.split('\0');
  if (parts.length < 5) return null;
  const [hash, shortHash, author, authoredAt, subject, parentsRaw = ''] = parts;
  if (!hash || !shortHash) return null;
  const parents = parentsRaw
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  return {
    hash,
    shortHash,
    author: author ?? '',
    authoredAt: authoredAt ?? '',
    subject: subject ?? '',
    parents,
  };
}

export async function listGitLog(
  workspace: string,
  opts: { limit?: number; skip?: number; q?: string } = {},
): Promise<{ commits: GitCommitSummary[]; error?: string }> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { commits: [], error: repo.error };

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const skip = Math.max(opts.skip ?? 0, 0);
  const q = opts.q?.trim() ?? '';

  const format = '--format=%H%x00%h%x00%an%x00%aI%x00%s%x00%P';
  const args = ['log', `--skip=${skip}`, `--max-count=${limit}`, format];
  if (q) {
    args.push('-i', `--grep=${q}`);
  }

  let result = await runGit(workspace, args);
  let lines = result.stdout.split(/\r?\n/).filter((l) => l.length > 0);
  let commits = lines.map(parseLogLine).filter((c): c is GitCommitSummary => c != null);

  // 短 hash 查询：grep 无命中时再试
  if (q && commits.length === 0 && /^[0-9a-f]{4,40}$/i.test(q)) {
    result = await runGit(workspace, ['log', '-1', format, q]);
    if (result.exitCode === 0) {
      lines = result.stdout.split(/\r?\n/).filter((l) => l.length > 0);
      commits = lines.map(parseLogLine).filter((c): c is GitCommitSummary => c != null);
    }
  }

  if (result.exitCode !== 0 && commits.length === 0) {
    return { commits: [], error: result.stderr.trim() || 'git log failed' };
  }
  await attachBranchHints(workspace, commits);
  return { commits };
}

/** 用 name-rev 给列表提交挂上可读分支提示（feature~2 → feature） */
async function attachBranchHints(workspace: string, commits: GitCommitSummary[]): Promise<void> {
  if (commits.length === 0) return;
  const hashes = commits.map((c) => c.hash);
  const result = await runGit(workspace, [
    'name-rev',
    '--name-only',
    '--refs=refs/heads/*',
    '--refs=refs/remotes/*',
    ...hashes,
  ]);
  if (result.exitCode !== 0 && !result.stdout.trim()) return;

  const lines = result.stdout.split(/\r?\n/).filter((l) => l.length > 0);
  // --name-only 多 hash：按参数顺序每行一个名字
  for (let i = 0; i < Math.min(lines.length, hashes.length); i++) {
    const raw = lines[i]!.trim();
    if (!raw || raw === 'undefined') continue;
    commits[i]!.branchHint = simplifyRevName(raw);
  }
}

function simplifyRevName(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^remotes\//, '');
  s = s.replace(/^heads\//, '');
  s = s.replace(/(?:[~^][\d]+)+$/g, '');
  return s || raw;
}

export async function getGitCommit(
  workspace: string,
  hash: string,
): Promise<{ commit?: GitCommitDetail; error?: string }> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { error: repo.error };

  const meta = await runGit(workspace, [
    'log',
    '-1',
    '--format=%H%x00%h%x00%an%x00%aI%x00%s%x00%b',
    hash,
  ]);
  if (meta.exitCode !== 0 || !meta.stdout.trim()) {
    return { error: meta.stderr.trim() || 'Commit not found' };
  }
  const parts = meta.stdout.replace(/\n$/, '').split('\0');
  const [fullHash, shortHash, author, authoredAt, subject, body = ''] = parts;
  if (!fullHash) return { error: 'Commit not found' };

  const numstat = await runGit(workspace, [
    'diff-tree',
    '--no-commit-id',
    '--numstat',
    '-r',
    '-M',
    '--root',
    fullHash,
  ]);
  const files: GitCommitFile[] = [];
  if (numstat.exitCode === 0) {
    for (const line of numstat.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const cols = line.split('\t');
      if (cols.length < 3) continue;
      const [addStr, delStr, pathRaw] = cols;
      let path = pathRaw ?? '';
      const arrow = path.indexOf(' => ');
      if (arrow >= 0) {
        path = path.slice(arrow + 4).replace(/[{}]/g, '');
      }
      const additions = addStr === '-' ? 0 : Number(addStr) || 0;
      const deletions = delStr === '-' ? 0 : Number(delStr) || 0;
      files.push({
        path,
        status: 'M',
        additions,
        deletions,
      });
    }
  }

  const nameStatus = await runGit(workspace, [
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-r',
    '-M',
    '--root',
    fullHash,
  ]);
  if (nameStatus.exitCode === 0) {
    const byPath = new Map(files.map((f) => [f.path, f]));
    for (const line of nameStatus.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const tab = line.indexOf('\t');
      if (tab < 0) continue;
      const status = line.slice(0, tab).charAt(0) || 'M';
      let path = line.slice(tab + 1);
      if (path.includes('\t')) {
        // R100\told\tnew
        const bits = path.split('\t');
        path = bits[bits.length - 1] ?? path;
      }
      const existing = byPath.get(path);
      if (existing) existing.status = status;
      else {
        const f: GitCommitFile = { path, status, additions: 0, deletions: 0 };
        files.push(f);
        byPath.set(path, f);
      }
    }
  }

  return {
    commit: {
      hash: fullHash,
      shortHash: shortHash || fullHash.slice(0, 7),
      author: author ?? '',
      authoredAt: authoredAt ?? '',
      subject: subject ?? '',
      body: (body ?? '').trimEnd(),
      files,
    },
  };
}

export async function getGitWorkingDiff(
  workspace: string,
  path: string,
  side: GitDiffSide = 'worktree',
): Promise<GitDiffPayload & { error?: string }> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) {
    return { path, unifiedDiff: '', truncated: false, error: repo.error };
  }
  const rel = path.replace(/\\/g, '/');
  const args =
    side === 'index' ? ['diff', '--cached', '--', rel] : ['diff', '--', rel];

  const result = await runGit(workspace, args);
  if (result.exitCode !== 0 && result.exitCode !== 1 && !result.stdout) {
    return {
      path: rel,
      unifiedDiff: '',
      truncated: false,
      error: result.stderr.trim() || 'git diff failed',
    };
  }

  if (side === 'worktree' && !result.stdout.trim()) {
    const tracked = await runGit(workspace, ['ls-files', '--error-unmatch', '--', rel]);
    if (tracked.exitCode !== 0) {
      const abs = resolve(workspace, rel);
      if (existsSync(abs)) {
        const after = readFileSync(abs, 'utf-8');
        const lines = after.split('\n');
        const raw = [
          `--- /dev/null`,
          `+++ b/${rel}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map((l) => `+${l}`),
          '',
        ].join('\n');
        const { text, truncated } = truncateDiff(raw);
        return { path: rel, unifiedDiff: text, truncated };
      }
    }
  }

  const { text, truncated } = truncateDiff(result.stdout);
  return { path: rel, unifiedDiff: text, truncated };
}

export async function getGitCommitDiff(
  workspace: string,
  hash: string,
  path: string,
): Promise<GitDiffPayload & { error?: string }> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) {
    return { path, unifiedDiff: '', truncated: false, error: repo.error };
  }
  const rel = path.replace(/\\/g, '/');
  const show = await runGit(workspace, ['show', hash, '--', rel]);
  if (show.exitCode !== 0 && !show.stdout) {
    return {
      path: rel,
      unifiedDiff: '',
      truncated: false,
      error: show.stderr.trim() || 'git show failed',
    };
  }
  let diff = show.stdout;
  const marker = diff.indexOf('diff --git');
  if (marker >= 0) diff = diff.slice(marker);
  const { text, truncated } = truncateDiff(diff);
  return { path: rel, unifiedDiff: text, truncated };
}

function normalizePaths(paths: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const p = raw.replace(/\\/g, '/').trim();
    if (!p || p.startsWith('/') || p.includes('..')) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function writeFail(stderr: string, fallback: string): GitWriteResult {
  return { ok: false, error: stderr.trim() || fallback };
}

/** 暂存：git add -- paths */
export async function gitStage(workspace: string, paths: string[]): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const list = normalizePaths(paths);
  if (list.length === 0) return { ok: false, error: 'No valid paths' };
  const result = await runGit(workspace, ['add', '--', ...list]);
  if (result.exitCode !== 0) return writeFail(result.stderr, 'git add failed');
  return { ok: true };
}

/** 取消暂存：git restore --staged -- paths */
export async function gitUnstage(workspace: string, paths: string[]): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const list = normalizePaths(paths);
  if (list.length === 0) return { ok: false, error: 'No valid paths' };
  const result = await runGit(workspace, ['restore', '--staged', '--', ...list]);
  if (result.exitCode !== 0) return writeFail(result.stderr, 'git restore --staged failed');
  return { ok: true };
}

/**
 * 丢弃工作区变更。
 * - unstaged → restore --
 * - untracked → clean -f --
 * - staged / unmerged → 拒绝（staged 用 unstage；冲突不自动丢弃）
 */
export async function gitDiscard(
  workspace: string,
  paths: string[],
  area: GitFileArea,
): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  if (area === 'unmerged') return { ok: false, error: 'Cannot discard unmerged files' };
  if (area === 'staged') return { ok: false, error: 'Use unstage for staged files' };
  const list = normalizePaths(paths);
  if (list.length === 0) return { ok: false, error: 'No valid paths' };

  if (area === 'untracked') {
    const result = await runGit(workspace, ['clean', '-f', '--', ...list]);
    if (result.exitCode !== 0) return writeFail(result.stderr, 'git clean failed');
    return { ok: true };
  }

  const result = await runGit(workspace, ['restore', '--', ...list]);
  if (result.exitCode !== 0) return writeFail(result.stderr, 'git restore failed');
  return { ok: true };
}

/** 提交：git commit -m */
export async function gitCommit(workspace: string, message: string): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const msg = message.trim();
  if (!msg) return { ok: false, error: 'Commit message is required' };

  const staged = await runGit(workspace, ['diff', '--cached', '--name-only']);
  if (staged.exitCode !== 0) return writeFail(staged.stderr, 'git diff --cached failed');
  if (!staged.stdout.trim()) return { ok: false, error: 'Nothing to commit' };

  const result = await runGit(workspace, ['commit', '-m', msg]);
  if (result.exitCode !== 0) return writeFail(result.stderr || result.stdout, 'git commit failed');
  return { ok: true };
}

export async function gitFetch(workspace: string): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const result = await runGit(workspace, ['fetch'], REMOTE_TIMEOUT_MS);
  if (result.exitCode !== 0) return writeFail(result.stderr, 'git fetch failed');
  return { ok: true };
}

export async function gitPull(workspace: string): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const result = await runGit(workspace, ['pull'], REMOTE_TIMEOUT_MS);
  if (result.exitCode !== 0) return writeFail(result.stderr || result.stdout, 'git pull failed');
  return { ok: true };
}

export async function gitPush(workspace: string): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const result = await runGit(workspace, ['push'], REMOTE_TIMEOUT_MS);
  if (result.exitCode !== 0) return writeFail(result.stderr || result.stdout, 'git push failed');
  return { ok: true };
}

export async function listGitBranches(
  workspace: string,
): Promise<{ branches: GitBranchSummary[]; error?: string }> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { branches: [], error: repo.error };

  const result = await runGit(workspace, [
    'for-each-ref',
    '--format=%(refname)%00%(refname:short)%00%(HEAD)',
    'refs/heads/',
    'refs/remotes/',
  ]);
  if (result.exitCode !== 0) {
    return { branches: [], error: result.stderr.trim() || 'git for-each-ref failed' };
  }
  const branches: GitBranchSummary[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [refname, short, head] = line.split('\0');
    if (!refname || !short) continue;
    if (refname.endsWith('/HEAD') || short.endsWith('/HEAD')) continue;
    const scope: 'local' | 'remote' = refname.startsWith('refs/remotes/') ? 'remote' : 'local';
    branches.push({ name: short, current: head === '*', scope });
  }
  return { branches };
}

function isValidRefName(name: string): boolean {
  return Boolean(name) && !name.startsWith('-') && !name.includes('..') && !/[\s\\]/.test(name);
}

export async function gitCheckout(workspace: string, branch: string): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const name = branch.trim();
  if (!isValidRefName(name)) {
    return { ok: false, error: 'Invalid branch name' };
  }
  // 远程跟踪分支：git switch --track origin/foo
  const args =
    name.includes('/') && !name.startsWith('refs/')
      ? ['switch', '--track', '--', name]
      : ['switch', '--', name];
  const result = await runGit(workspace, args);
  if (result.exitCode !== 0) return writeFail(result.stderr || result.stdout, 'git switch failed');
  return { ok: true };
}

/** 新建并切换分支：git switch -c <name> */
export async function gitCreateBranch(workspace: string, branch: string): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const name = branch.trim();
  if (!isValidRefName(name)) {
    return { ok: false, error: 'Invalid branch name' };
  }
  const result = await runGit(workspace, ['switch', '-c', name]);
  if (result.exitCode !== 0) {
    return writeFail(result.stderr || result.stdout, 'git switch -c failed');
  }
  return { ok: true };
}

/** 轻量 tag：git tag <name> [<hash>]；不做 -a / -f */
export async function gitCreateTag(
  workspace: string,
  tag: string,
  hash?: string,
): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const name = tag.trim();
  if (!isValidRefName(name)) {
    return { ok: false, error: 'Invalid tag name' };
  }
  const args = ['tag', '--', name];
  const h = hash?.trim();
  if (h) {
    if (!/^[0-9a-fA-F]{7,40}$/.test(h)) {
      return { ok: false, error: 'Invalid commit hash' };
    }
    args.push(h);
  }
  const result = await runGit(workspace, args);
  if (result.exitCode !== 0) return writeFail(result.stderr || result.stdout, 'git tag failed');
  return { ok: true };
}

/** cherry-pick：冲突时透出 stderr，不做 abort/continue */
export async function gitCherryPick(workspace: string, hash: string): Promise<GitWriteResult> {
  const repo = await assertRepo(workspace);
  if (!repo.ok) return { ok: false, error: repo.error };
  const h = hash.trim();
  if (!/^[0-9a-fA-F]{7,40}$/.test(h)) {
    return { ok: false, error: 'Invalid commit hash' };
  }
  const result = await runGit(workspace, ['cherry-pick', h]);
  if (result.exitCode !== 0) {
    return writeFail(result.stderr || result.stdout, 'git cherry-pick failed');
  }
  return { ok: true };
}
