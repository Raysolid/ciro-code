import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { HARNESS_VERSION, type PlanQuestionAnswer } from '@ciro-code/harness-shared';
import {
  loadEffectiveConfig,
  listMemoryEntries,
  patchProjectExploreModel,
} from '@ciro-code/harness-core';
import type { AppContext } from '../app-context.js';

export function registerMiscRoutes(app: Hono, ctx: AppContext): void {
  const { config, runtime, services, listSessionsJson, uiDistPath, shellAllowlist } = ctx;

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      version: HARNESS_VERSION,
      agentBackend: config.agentBackend,
      workspace: config.workspace,
      bind: config.bind,
    }),
  );
  app.get('/healthz', (c) => c.redirect('/health'));

  app.post('/api/v1/permissions/:id/resolve', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ decision: 'allow' | 'deny'; remember?: boolean }>();
    if (body.decision !== 'allow' && body.decision !== 'deny') {
      return c.json({ error: 'decision must be allow or deny' }, 400);
    }
    const remember = body.remember === true;
    const ok = await runtime.resolvePermission(id, body.decision, { remember });
    if (!ok) {
      return c.json({ error: 'Permission request not found' }, 404);
    }
    return c.json({
      ok: true,
      permissionId: id,
      decision: body.decision,
      remembered: remember && body.decision === 'allow',
    });
  });

  app.get('/api/v1/permissions/shell-allowlist', (c) => {
    return c.json({ patterns: shellAllowlist.list(), path: shellAllowlist.path });
  });

  app.put('/api/v1/permissions/shell-allowlist', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { patterns?: unknown };
    if (!Array.isArray(body.patterns)) {
      return c.json({ error: 'patterns must be an array of strings' }, 400);
    }
    const patterns = body.patterns.filter((x): x is string => typeof x === 'string');
    return c.json({
      ok: true,
      patterns: shellAllowlist.setAll(patterns),
      path: shellAllowlist.path,
    });
  });

  app.post('/api/v1/permissions/shell-allowlist', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { pattern?: string };
    if (typeof body.pattern !== 'string' || !body.pattern.trim()) {
      return c.json({ error: 'pattern required' }, 400);
    }
    const added = shellAllowlist.add(body.pattern);
    return c.json({
      ok: true,
      added,
      patterns: shellAllowlist.list(),
      path: shellAllowlist.path,
    });
  });

  app.delete('/api/v1/permissions/shell-allowlist', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { pattern?: string; all?: boolean };
    if (body.all === true) {
      shellAllowlist.clear();
      return c.json({ ok: true, patterns: [] as string[], path: shellAllowlist.path });
    }
    if (typeof body.pattern !== 'string' || !body.pattern.trim()) {
      return c.json({ error: 'pattern or all=true required' }, 400);
    }
    const removed = shellAllowlist.remove(body.pattern);
    return c.json({
      ok: true,
      removed,
      patterns: shellAllowlist.list(),
      path: shellAllowlist.path,
    });
  });

  /** 诊断：effective config 只读树（secrets 已由 load 侧隔离；此处不回传 key） */
  app.get('/api/v1/diagnostics/effective-config', (c) => {
    const effective = loadEffectiveConfig({ workspace: config.workspace });
    const cfg = effective.config;
    return c.json({
      mode: config.mode,
      agentBackend: config.agentBackend,
      workspace: config.workspace,
      bind: config.bind,
      permissions: {
        preset:
          cfg.permissions?.preset ??
          null,
        shellAllowlist: {
          patterns: shellAllowlist.list(),
          path: shellAllowlist.path,
        },
      },
      tools: cfg.tools,
      subagents: cfg.subagents,
      memory: cfg.memory,
      compaction: cfg.compaction,
      skill: cfg.skill,
      ui: cfg.ui,
      session: cfg.session,
      sources: effective.sources,
      paths: effective.paths,
      profileId: effective.profileId,
      warnings: effective.warnings,
    });
  });

  app.post('/api/v1/mode-suggest/:id/resolve', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ decision: 'switch' | 'skip' }>();
    if (body.decision !== 'switch' && body.decision !== 'skip') {
      return c.json({ error: 'decision must be switch or skip' }, 400);
    }
    const ok = await runtime.resolveModeSuggest(id, body.decision);
    if (!ok) {
      return c.json({ error: 'Mode suggestion not found' }, 404);
    }
    return c.json({ ok: true, suggestId: id, decision: body.decision });
  });

  app.post('/api/v1/plan-questions/:id/resolve', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ skipped?: boolean; answers?: PlanQuestionAnswer[] }>();
    const skipped = body.skipped === true;
    const answers = Array.isArray(body.answers) ? body.answers : [];
    if (!skipped && answers.length === 0) {
      return c.json({ error: 'skipped or answers required' }, 400);
    }
    const ok = await runtime.resolvePlanQuestion(id, skipped ? { skipped: true } : { answers });
    if (!ok) {
      return c.json({ error: 'Plan question not found' }, 404);
    }
    return c.json({ ok: true, questionId: id, skipped });
  });

  app.get('/api/v1/audit', (c) => {
    const sessionId = c.req.query('sessionId') || undefined;
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Number(limitRaw) : 100;
    return c.json(runtime.listAudit({ sessionId, limit }));
  });

  app.get('/api/v1/config/effective', (c) => {
    const effective = loadEffectiveConfig({
      workspace: config.workspace,
    });
    return c.json({
      config: { ...effective.config, mode: config.mode, agentBackend: config.agentBackend },
      runtime: {
        mode: config.mode,
        agentBackend: config.agentBackend,
        bind: config.bind,
      },
      sources: effective.sources,
      paths: effective.paths,
      warnings: effective.warnings,
    });
  });

  /** 窄写：仅 `subagents.exploreModel` → 项目 `.ciro/config.yaml`；下次 send/Task 生效 */
  app.put('/api/v1/config/subagents', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      exploreModel?: string;
    };
    const exploreModel = body.exploreModel;
    if (exploreModel !== 'inherit' && exploreModel !== 'fast') {
      return c.json({ error: 'exploreModel must be inherit or fast' }, 400);
    }
    try {
      const patched = patchProjectExploreModel(config.workspace, exploreModel);
      config.subagents = { ...config.subagents, exploreModel };
      const effective = loadEffectiveConfig({ workspace: config.workspace });
      return c.json({
        ok: true,
        exploreModel: patched.exploreModel,
        path: patched.path,
        source: effective.sources.subagents,
        appliesOn: 'next_send',
      });
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : 'Failed to patch subagents config' },
        500,
      );
    }
  });

  app.get('/api/v1/skills', (c) => {
    return c.json({
      items: services.skillRegistry.reload().map((s) => ({
        name: s.name,
        description: s.description,
        path: s.path,
        source: s.source,
        triggers: s.triggers,
        requiresMcp: s.requiresMcp,
      })),
      maxInjectTokens: services.skillRegistry.maxInjectTokens,
    });
  });

  app.get('/api/v1/assembly', (c) => {
    return c.json({
      sessions: listSessionsJson(),
      memory: listMemoryEntries(services.memoryStore),
      skills: services.skillRegistry.list().map((s) => ({
        name: s.name,
        description: s.description,
        source: s.source,
        triggers: s.triggers,
        requiresMcp: s.requiresMcp,
      })),
      rules: services.ruleRegistry.list(),
      workspace: config.workspace,
      mode: config.mode,
    });
  });

  if (uiDistPath) {
    app.use('/*', serveStatic({ root: uiDistPath }));
    app.get('/', serveStatic({ root: uiDistPath, path: 'index.html' }));
  }
}
