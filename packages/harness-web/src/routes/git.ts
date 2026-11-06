import type { Hono } from 'hono';
import {
  PolicyEngine,
  getGitCommit,
  getGitCommitDiff,
  getGitWorkingDiff,
  getWorkspaceGitStatus,
  gitCheckout,
  gitCherryPick,
  gitCommit,
  gitCreateBranch,
  gitCreateTag,
  gitDiscard,
  gitFetch,
  gitPull,
  gitPush,
  gitStage,
  gitUnstage,
  listGitBranches,
  listGitLog,
} from '@ciro-code/harness-core';
import type { GitDiffSide, GitFileArea } from '@ciro-code/harness-shared';
import type { AppContext } from '../app-context.js';

const GIT_PACK_ID = '@ciro-code/ext-git';
const policy = new PolicyEngine();

type WriteGate =
  | { ok: true }
  | { ok: false; response: Response };

function assertGitWriteAllowed(
  workspace: string,
  command: string,
  confirmed?: boolean,
): WriteGate {
  const result = policy.evaluate({
    mode: 'agent',
    toolName: 'bash',
    toolInput: { command },
    workspace,
  });

  if (result.decision === 'deny') {
    return {
      ok: false,
      response: Response.json(
        { error: result.reason ?? 'Denied by policy' },
        { status: 403 },
      ),
    };
  }
  if (result.decision === 'ask' && !confirmed) {
    return {
      ok: false,
      response: Response.json(
        {
          error: result.reason ?? 'Confirmation required',
          requiresConfirmation: true,
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true };
}

function requireConfirmed(confirmed: unknown, label: string): Response | null {
  if (confirmed !== true) {
    return Response.json(
      { error: `${label} requires confirmation`, requiresConfirmation: true },
      { status: 403 },
    );
  }
  return null;
}

function parsePaths(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const paths = (body as { paths?: unknown }).paths;
  if (!Array.isArray(paths)) return [];
  return paths.filter((p): p is string => typeof p === 'string');
}

export function registerGitRoutes(app: Hono, ctx: AppContext): void {
  const { config, packStore } = ctx;

  const assertGitPackEnabled = (): Response | null => {
    if (!packStore.isEnabled(GIT_PACK_ID)) {
      return Response.json({ error: 'Git pack is not enabled' }, { status: 403 });
    }
    return null;
  };

  app.get('/api/v1/git/status', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    try {
      const status = await getWorkspaceGitStatus(config.workspace);
      return c.json(status);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/v1/git/log', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const limit = Number(c.req.query('limit') ?? '50');
    const skip = Number(c.req.query('skip') ?? '0');
    const q = c.req.query('q') ?? undefined;
    try {
      const out = await listGitLog(config.workspace, {
        limit: Number.isFinite(limit) ? limit : 50,
        skip: Number.isFinite(skip) ? skip : 0,
        q,
      });
      if (out.error) return c.json({ error: out.error, commits: out.commits }, 400);
      return c.json({ commits: out.commits });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/v1/git/commits/:hash', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const hash = c.req.param('hash');
    try {
      const out = await getGitCommit(config.workspace, hash);
      if (!out.commit) return c.json({ error: out.error ?? 'Commit not found' }, 404);
      return c.json(out.commit);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/v1/git/diff', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const path = c.req.query('path')?.trim();
    if (!path) return c.json({ error: 'path is required' }, 400);
    const sideRaw = c.req.query('side') ?? 'worktree';
    const side: GitDiffSide = sideRaw === 'index' ? 'index' : 'worktree';
    try {
      const out = await getGitWorkingDiff(config.workspace, path, side);
      if (out.error) return c.json({ error: out.error }, 400);
      return c.json({
        path: out.path,
        unifiedDiff: out.unifiedDiff,
        truncated: out.truncated,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/v1/git/commits/:hash/diff', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const hash = c.req.param('hash');
    const path = c.req.query('path')?.trim();
    if (!path) return c.json({ error: 'path is required' }, 400);
    try {
      const out = await getGitCommitDiff(config.workspace, hash, path);
      if (out.error) return c.json({ error: out.error }, 400);
      return c.json({
        path: out.path,
        unifiedDiff: out.unifiedDiff,
        truncated: out.truncated,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/v1/git/branches', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    try {
      const out = await listGitBranches(config.workspace);
      if (out.error) return c.json({ error: out.error, branches: out.branches }, 400);
      return c.json({ branches: out.branches });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/stage', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const paths = parsePaths(body);
    if (paths.length === 0) return c.json({ error: 'paths is required' }, 400);
    const cmd = `git add -- ${paths.join(' ')}`;
    const gate = assertGitWriteAllowed(config.workspace, cmd);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitStage(config.workspace, paths);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/unstage', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const paths = parsePaths(body);
    if (paths.length === 0) return c.json({ error: 'paths is required' }, 400);
    const cmd = `git restore --staged -- ${paths.join(' ')}`;
    const gate = assertGitWriteAllowed(config.workspace, cmd);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitUnstage(config.workspace, paths);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/discard', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      paths?: unknown;
      area?: unknown;
      confirmed?: unknown;
    };
    const conf = requireConfirmed(body.confirmed, 'Discard');
    if (conf) return conf;
    const paths = parsePaths(body);
    if (paths.length === 0) return c.json({ error: 'paths is required' }, 400);
    const areaRaw = typeof body.area === 'string' ? body.area : 'unstaged';
    const area: GitFileArea =
      areaRaw === 'untracked' || areaRaw === 'staged' || areaRaw === 'unmerged'
        ? areaRaw
        : 'unstaged';
    const cmd =
      area === 'untracked'
        ? `git clean -f -- ${paths.join(' ')}`
        : `git restore -- ${paths.join(' ')}`;
    const gate = assertGitWriteAllowed(config.workspace, cmd, true);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitDiscard(config.workspace, paths, area);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/commit', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      message?: unknown;
      confirmed?: unknown;
    };
    const conf = requireConfirmed(body.confirmed, 'Commit');
    if (conf) return conf;
    const message = typeof body.message === 'string' ? body.message : '';
    const cmd = `git commit -m ${JSON.stringify(message.trim())}`;
    const gate = assertGitWriteAllowed(config.workspace, cmd, true);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitCommit(config.workspace, message);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/fetch', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const gate = assertGitWriteAllowed(config.workspace, 'git fetch');
    if (!gate.ok) return gate.response;
    try {
      const out = await gitFetch(config.workspace);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/pull', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const gate = assertGitWriteAllowed(config.workspace, 'git pull');
    if (!gate.ok) return gate.response;
    try {
      const out = await gitPull(config.workspace);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/push', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as { confirmed?: unknown };
    const conf = requireConfirmed(body.confirmed, 'Push');
    if (conf) return conf;
    const gate = assertGitWriteAllowed(config.workspace, 'git push', true);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitPush(config.workspace);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/checkout', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      branch?: unknown;
      confirmed?: unknown;
    };
    const conf = requireConfirmed(body.confirmed, 'Checkout');
    if (conf) return conf;
    const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
    if (!branch) return c.json({ error: 'branch is required' }, 400);
    const cmd = `git checkout ${branch}`;
    const gate = assertGitWriteAllowed(config.workspace, cmd, true);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitCheckout(config.workspace, branch);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/branch', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return c.json({ error: 'name is required' }, 400);
    const cmd = `git branch ${name}`;
    const gate = assertGitWriteAllowed(config.workspace, cmd);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitCreateBranch(config.workspace, name);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/tag', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: unknown;
      hash?: unknown;
    };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return c.json({ error: 'name is required' }, 400);
    const hash = typeof body.hash === 'string' ? body.hash.trim() : undefined;
    const cmd = hash ? `git tag ${name} ${hash}` : `git tag ${name}`;
    const gate = assertGitWriteAllowed(config.workspace, cmd);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitCreateTag(config.workspace, name, hash);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/git/cherry-pick', async (c) => {
    const denied = assertGitPackEnabled();
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as {
      hash?: unknown;
      confirmed?: unknown;
    };
    const conf = requireConfirmed(body.confirmed, 'Cherry-pick');
    if (conf) return conf;
    const hash = typeof body.hash === 'string' ? body.hash.trim() : '';
    if (!hash) return c.json({ error: 'hash is required' }, 400);
    const cmd = `git cherry-pick ${hash}`;
    const gate = assertGitWriteAllowed(config.workspace, cmd, true);
    if (!gate.ok) return gate.response;
    try {
      const out = await gitCherryPick(config.workspace, hash);
      if (!out.ok) return c.json({ error: out.error }, 400);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
