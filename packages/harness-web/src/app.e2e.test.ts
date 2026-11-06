import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SseEnvelope } from '@ciro-code/harness-shared';
import { loadConfig, SessionStore, AuditLog, PermissionBroker, SkillRegistry } from '@ciro-code/harness-core';
import { createAgentRuntime } from '@ciro-code/harness-pi';
import { createHarnessApp } from './app.js';

async function collectSse(res: Response): Promise<SseEnvelope[]> {
  const text = await res.text();
  const events: SseEnvelope[] = [];
  for (const block of text.split('\n\n')) {
    const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice(5).trim()) as SseEnvelope);
    } catch {
      // skip
    }
  }
  return events;
}

describe('harness-web Phase2 Sprint1 API e2e', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-web-e2e-'));
  writeFileSync(join(workspace, 'README.md'), '# fixture\n');
  mkdirSync(join(workspace, '.ciro'), { recursive: true });
  writeFileSync(
    join(workspace, '.ciro', 'config.yaml'),
    `mode: ask\ntools: [read, list_files, grep, bash]\n`,
  );
  const sessionsRoot = join(workspace, 'sessions');

  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'ask',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot });
  const skillRegistry = new SkillRegistry({
    workspace,
    maxInjectTokens: config.skill.maxInjectTokens,
  });
  const runtime = createAgentRuntime(config, {
    sessionStore,
    auditLog: new AuditLog(join(workspace, 'audit.db')),
    permissionBroker: new PermissionBroker(),
    skillRegistry,
  });
  const app = createHarnessApp({ config, runtime, sessionStore, skillRegistry });

  it('GET /config/effective shows project override', async () => {
    const res = await app.request('/api/v1/config/effective');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: { mode: string };
      paths: { project?: string };
      config: { memory: { enableEmbedding: boolean } };
    };
    expect(body.sources.mode).toBe('project');
    expect(body.paths.project).toBeTruthy();
    expect(body.config.memory.enableEmbedding).toBe(false);
  });

  it('PUT /config/subagents patches exploreModel for next send', async () => {
    const put = await app.request('/api/v1/config/subagents', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exploreModel: 'fast' }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as {
      exploreModel: string;
      appliesOn: string;
      source: string;
    };
    expect(putBody.exploreModel).toBe('fast');
    expect(putBody.appliesOn).toBe('next_send');
    expect(putBody.source).toBe('project');

    const get = await app.request('/api/v1/config/effective');
    const effective = (await get.json()) as {
      config: { subagents: { exploreModel: string } };
      sources: { subagents: string };
    };
    expect(effective.config.subagents.exploreModel).toBe('fast');
    expect(effective.sources.subagents).toBe('project');
  });

  it('GET /files/tree and /files/content', async () => {
    const treeRes = await app.request('/api/v1/files/tree?path=.');
    expect(treeRes.status).toBe(200);
    const tree = (await treeRes.json()) as { children?: Array<{ name: string }> };
    expect((tree.children ?? []).some((c) => c.name === 'README.md')).toBe(true);

    const fileRes = await app.request('/api/v1/files/content?path=README.md');
    expect(fileRes.status).toBe(200);
    const file = (await fileRes.json()) as {
      content: string;
      truncated: boolean;
      totalLines: number;
    };
    expect(file.content).toContain('fixture');
    expect(file.truncated).toBe(false);
    expect(file.totalLines).toBeGreaterThan(0);
  });

  it('GET /files/search', async () => {
    const res = await app.request('/api/v1/files/search?q=README');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ path: string }> };
    expect(body.items.some((c) => c.path === 'README.md')).toBe(true);
  });

  it('memory list and put entry', async () => {
    const listRes = await app.request('/api/v1/memory');
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as {
      items: Array<{ id: string; path: string }>;
    };
    expect(list.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(['global-agents', 'project-agents', 'memory-md', 'session-memory']),
    );

    const putRes = await app.request('/api/v1/memory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'MEMORY.md',
        content: '# Workspace Memory\n\nRedis cache in front of API Gateway\n',
      }),
    });
    expect(putRes.status).toBe(200);

    const contentRes = await app.request('/api/v1/memory/content?path=MEMORY.md');
    expect(contentRes.status).toBe(200);
    const body = (await contentRes.json()) as { content: string };
    expect(body.content).toContain('Redis');
  });

  it('session context and events after chat', async () => {
    const session = (await (
      await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ask' }),
      })
    ).json()) as { id: string };

    const chatRes = await app.request(`/api/v1/chat/${session.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello sprint1' }),
    });
    const events = await collectSse(chatRes);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(events.some((e) => e.type === 'context_usage')).toBe(true);

    const ctxRes = await app.request(`/api/v1/sessions/${session.id}/context`);
    expect(ctxRes.status).toBe(200);
    const snap = (await ctxRes.json()) as {
      usageRatio: number;
      buckets: Array<{ id: string }>;
    };
    expect(snap.buckets.map((b) => b.id)).toEqual(
      expect.arrayContaining([
        'system',
        'tools',
        'conversation',
        'memory',
        'skills',
        'summarized',
      ]),
    );

    const compactRes = await app.request(`/api/v1/sessions/${session.id}/compact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'micro' }),
    });
    expect(compactRes.status).toBe(200);
    const compactBody = (await compactRes.json()) as {
      result: { metadata: { method: string } };
    };
    expect(compactBody.result.metadata.method).toBe('micro');

    const evRes = await app.request(`/api/v1/sessions/${session.id}/events`);
    expect(evRes.status).toBe(200);
    const body = (await evRes.json()) as { events: Array<{ type: string }> };
    expect(body.events.some((e) => e.type === 'session_start')).toBe(true);
    expect(body.events.some((e) => e.type === 'message')).toBe(true);
  });

  it('chat send with images persists attachments and resume restores refs', async () => {
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const session = (await (
      await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ask' }),
      })
    ).json()) as { id: string };

    const chatRes = await app.request(`/api/v1/chat/${session.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'what is in the image?',
        images: [{ type: 'image', data: tinyPng, mimeType: 'image/png' }],
      }),
    });
    const events = await collectSse(chatRes);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);

    const evRes = await app.request(`/api/v1/sessions/${session.id}/events`);
    const body = (await evRes.json()) as {
      events: Array<{ type: string; role?: string; images?: Array<{ path: string }> }>;
    };
    const userEv = body.events.find((e) => e.type === 'message' && e.role === 'user');
    expect(userEv?.images?.[0]?.path).toMatch(/^attachments\//);

    const attRes = await app.request(
      `/api/v1/chat/${session.id}/attachments?path=${encodeURIComponent(userEv!.images![0]!.path)}`,
    );
    expect(attRes.status).toBe(200);
    expect(attRes.headers.get('content-type')).toContain('image/png');

    const resumeRes = await app.request(`/api/v1/sessions/${session.id}/resume`, {
      method: 'POST',
    });
    expect(resumeRes.status).toBe(200);
    const resumed = (await resumeRes.json()) as {
      messages: Array<{ role: string; images?: Array<{ path: string }> }>;
    };
    const userMsg = resumed.messages.find((m) => m.role === 'user');
    expect(userMsg?.images?.[0]?.path).toMatch(/^attachments\//);
  });

  it('chat send rejects invalid image mime', async () => {
    const session = (await (
      await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ask' }),
      })
    ).json()) as { id: string };

    const chatRes = await app.request(`/api/v1/chat/${session.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'svg?',
        images: [{ type: 'image', data: 'AAAA', mimeType: 'image/svg+xml' }],
      }),
    });
    const events = await collectSse(chatRes);
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('POST resume restores session after in-memory delete', async () => {
    const session = (await (
      await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ask' }),
      })
    ).json()) as { id: string };

    await collectSse(
      await app.request(`/api/v1/chat/${session.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'persist-me-please' }),
      }),
    );

    // 模拟进程重启：仅清内存，保留 events.jsonl
    await runtime.deleteSession(session.id);
    expect(runtime.getSession(session.id)).toBeUndefined();

    const resumeRes = await app.request(`/api/v1/sessions/${session.id}/resume`, {
      method: 'POST',
    });
    expect(resumeRes.status).toBe(200);
    const resumed = (await resumeRes.json()) as {
      type: string;
      session: { id: string; mode: string };
      messageCount: number;
      eventsReplayed: number;
      stoppedAtBoundary: boolean;
    };
    expect(resumed.type).toBe('session_recovered');
    expect(resumed.session.id).toBe(session.id);
    expect(resumed.session.mode).toBe('ask');
    expect(resumed.messageCount).toBeGreaterThanOrEqual(1);
    expect(resumed.eventsReplayed).toBeGreaterThanOrEqual(2);
    expect(resumed.stoppedAtBoundary).toBe(false);
    expect(runtime.getSession(session.id)?.id).toBe(session.id);

    const listRes = await app.request('/api/v1/sessions');
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.some((s) => s.id === session.id)).toBe(true);
  });

  it('skills, assembly, and full compact', async () => {
    const skillDir = join(workspace, '.ciro', 'skills', 'review');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: review\n---\n# Review\n\nLook at diffs.\n`,
    );

    const skillsRes = await app.request('/api/v1/skills');
    expect(skillsRes.status).toBe(200);
    const skills = (await skillsRes.json()) as { items: Array<{ name: string }> };
    expect(skills.items.some((s) => s.name === 'review')).toBe(true);

    const assemblyRes = await app.request('/api/v1/assembly');
    expect(assemblyRes.status).toBe(200);
    const assembly = (await assemblyRes.json()) as {
      skills: Array<{ name: string }>;
      sessions: unknown[];
      memory: unknown[];
    };
    expect(assembly.skills.some((s) => s.name === 'review')).toBe(true);

    const session = (await (
      await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ask' }),
      })
    ).json()) as { id: string };

    const events = await collectSse(
      await app.request(`/api/v1/chat/${session.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '/review this' }),
      }),
    );
    expect(events.some((e) => e.type === 'skill_activated')).toBe(true);

    const compactRes = await app.request(`/api/v1/sessions/${session.id}/compact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'full' }),
    });
    expect(compactRes.status).toBe(200);
    const compactBody = (await compactRes.json()) as {
      result: { metadata: { method: string }; structured?: { decisions: unknown[] } };
    };
    expect(compactBody.result.metadata.method).toBe('full');
  });

  it('Ask denies write via HTTP; Agent writes via runtime', async () => {
    const askSession = (await (
      await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ask' }),
      })
    ).json()) as { id: string };

    const askRes = await app.request(`/api/v1/chat/${askSession.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Please write to file.txt' }),
    });
    const askEvents = await collectSse(askRes);
    expect(askEvents.some((e) => e.type === 'error')).toBe(true);

    const agentRuntime = createAgentRuntime(
      { ...config, mode: 'agent' },
      {
        sessionStore: new SessionStore({ sessionsRoot: join(workspace, 'sessions-agent') }),
        auditLog: new AuditLog(join(workspace, 'audit-agent.db')),
        permissionBroker: new PermissionBroker(),
      },
    );
    const agentSession = await agentRuntime.createSession({ workspace, mode: 'agent' });
    const agentEvents: Array<{ type: string; payload?: unknown }> = [];
    for await (const e of agentRuntime.sendMessage(
      agentSession.id,
      { message: 'write out.txt <<<phase1-w3>>>' },
      { sessionId: agentSession.id, mode: 'agent', workspace },
    )) {
      agentEvents.push(e);
    }
    if (!agentEvents.some((e) => e.type === 'complete')) {
      throw new Error(`unexpected events: ${JSON.stringify(agentEvents)}`);
    }
    expect(existsSync(join(workspace, 'out.txt'))).toBe(true);
    expect(readFileSync(join(workspace, 'out.txt'), 'utf-8')).toBe('phase1-w3');
  });

  it('WebFetch denies loopback; Agent denies curl bash', async () => {
    const askSession = (await (
      await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ask' }),
      })
    ).json()) as { id: string };
    const fetchRes = await app.request(`/api/v1/chat/${askSession.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'webfetch <<<http://127.0.0.1/>>>' }),
    });
    const fetchEvents = await collectSse(fetchRes);
    const fetchResult = fetchEvents.find((e) => e.type === 'tool_call_result');
    expect(fetchResult).toBeTruthy();
    expect(
      (fetchResult?.payload as { status?: string } | undefined)?.status === 'error' ||
        fetchEvents.some((e) => e.type === 'error'),
    ).toBe(true);

    const agentRuntime = createAgentRuntime(
      { ...config, mode: 'agent' },
      {
        sessionStore: new SessionStore({ sessionsRoot: join(workspace, 'sessions-curl') }),
        auditLog: new AuditLog(join(workspace, 'audit-curl.db')),
        permissionBroker: new PermissionBroker(),
      },
    );
    const agentSession = await agentRuntime.createSession({ workspace, mode: 'agent' });
    const agentEvents: Array<{ type: string; payload?: unknown }> = [];
    for await (const e of agentRuntime.sendMessage(
      agentSession.id,
      { message: 'bash <<<curl https://example.com>>>' },
      { sessionId: agentSession.id, mode: 'agent', workspace },
    )) {
      agentEvents.push(e);
    }
    expect(
      agentEvents.some(
        (e) =>
          e.type === 'tool_call_result' &&
          (e.payload as { toolName?: string; isError?: boolean }).toolName === 'bash' &&
          (e.payload as { isError?: boolean }).isError === true,
      ),
    ).toBe(true);
  });
});

describe('harness-web Plan confirm API', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-web-plan-'));
  writeFileSync(join(workspace, 'README.md'), '# plan\n');
  const sessionsRoot = join(workspace, 'sessions');
  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'plan',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot });
  const runtime = createAgentRuntime(config, {
    sessionStore,
    auditLog: new AuditLog(join(workspace, 'audit-plan.db')),
    permissionBroker: new PermissionBroker(),
  });
  const app = createHarnessApp({ config, runtime, sessionStore });

  it('create plan then confirm upgrades to agent', async () => {
    const created = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'plan' }),
    });
    expect(created.status).toBe(200);
    const session = (await created.json()) as { id: string; mode: string };
    expect(session.mode).toBe('plan');

    const { PlanStore } = await import('@ciro-code/harness-core');
    const store = new PlanStore({ sessionsRoot });
    const record = store.create(session.id, {
      title: 'Ship feature',
      markdown: '## Steps\n\n1. Edit one file\n',
    });

    const listRes = await app.request(`/api/v1/sessions/${session.id}/plans`);
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { plans: Array<{ planId: string }> };
    expect(listed.plans.some((p) => p.planId === record.planId)).toBe(true);

    const confirmRes = await app.request(
      `/api/v1/sessions/${session.id}/plans/${record.planId}/confirm`,
      { method: 'POST' },
    );
    expect(confirmRes.status).toBe(200);
    const body = (await confirmRes.json()) as {
      mode: string;
      plan: { confirmedAt?: number };
      session: { mode: string };
    };
    expect(body.mode).toBe('agent');
    expect(body.session.mode).toBe('agent');
    expect(body.plan.confirmedAt).toBeTruthy();

    const saveRes = await app.request(
      `/api/v1/sessions/${session.id}/plans/${record.planId}/save-to-workspace`,
      { method: 'POST' },
    );
    expect(saveRes.status).toBe(200);
    const saved = (await saveRes.json()) as { pathRel: string };
    expect(saved.pathRel).toBe(`.ciro/plans/Ship_feature_${record.planId}.plan.md`);
    expect(existsSync(join(workspace, saved.pathRel))).toBe(true);
  });
});

describe('harness-web Debug ingest API', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-web-debug-'));
  writeFileSync(join(workspace, 'README.md'), '# debug\n');
  const sessionsRoot = join(workspace, 'sessions');
  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'agent',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot });
  const runtime = createAgentRuntime(config, {
    sessionStore,
    auditLog: new AuditLog(join(workspace, 'audit-debug.db')),
    permissionBroker: new PermissionBroker(),
  });
  const app = createHarnessApp({ config, runtime, sessionStore });

  it('starts ingest when session is created in debug', async () => {
    const created = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'debug' }),
    });
    expect(created.status).toBe(200);
    const session = (await created.json()) as { id: string };
    const dbgRes = await app.request(`/api/v1/sessions/${session.id}/debug`);
    expect(dbgRes.status).toBe(200);
    const dbg = (await dbgRes.json()) as { ingestRunning: boolean; ingestUrl: string };
    expect(dbg.ingestRunning).toBe(true);
    expect(dbg.ingestUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/ingest\//);

    const emptyLogs = await app.request(`/api/v1/sessions/${session.id}/debug/logs`);
    expect(emptyLogs.status).toBe(200);
    expect(((await emptyLogs.json()) as { lines: string[] }).lines).toEqual([]);

    const post = await fetch(dbg.ingestUrl, {
      method: 'POST',
      body: JSON.stringify({ hypothesisId: 'H1', message: 'probe' }),
    });
    expect(post.status).toBe(204);
    const filled = await app.request(`/api/v1/sessions/${session.id}/debug/logs`);
    expect(filled.status).toBe(200);
    const lines = ((await filled.json()) as { lines: string[] }).lines;
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('probe');

    const cleared = await app.request(`/api/v1/sessions/${session.id}/debug/logs`, {
      method: 'DELETE',
    });
    expect(cleared.status).toBe(200);
    expect(((await cleared.json()) as { lines: string[] }).lines).toEqual([]);
    const afterClear = await app.request(`/api/v1/sessions/${session.id}/debug/logs`);
    expect(((await afterClear.json()) as { lines: string[] }).lines).toEqual([]);
  });

  it('enters debug, exposes ingest, proceed and mark-fixed', async () => {
    const created = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'agent' }),
    });
    const session = (await created.json()) as { id: string };

    const patched = await app.request(`/api/v1/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'debug' }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { mode: string }).mode).toBe('debug');

    const dbgRes = await app.request(`/api/v1/sessions/${session.id}/debug`);
    expect(dbgRes.status).toBe(200);
    const dbg = (await dbgRes.json()) as {
      ingestUrl: string;
      logPathRel: string;
      status: string;
      ingestRunning: boolean;
    };
    expect(dbg.ingestRunning).toBe(true);
    expect(dbg.ingestUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/ingest\//);

    const post = await fetch(dbg.ingestUrl, {
      method: 'POST',
      body: JSON.stringify({ hypothesisId: 'H1', message: 'ok' }),
    });
    expect(post.status).toBe(204);

    const proceed = await app.request(`/api/v1/sessions/${session.id}/debug/proceed`, {
      method: 'POST',
    });
    expect(proceed.status).toBe(200);
    expect(((await proceed.json()) as { status: string }).status).toBe('logs_ready');

    const fixed = await app.request(`/api/v1/sessions/${session.id}/debug/mark-fixed`, {
      method: 'POST',
    });
    expect(fixed.status).toBe(200);
    const afterFixed = (await fixed.json()) as { status: string; ingestRunning: boolean };
    expect(afterFixed.ingestRunning).toBe(true);
    expect(afterFixed.status).not.toBe('stopped');
    const postAfterFixed = await fetch(dbg.ingestUrl, {
      method: 'POST',
      body: JSON.stringify({ hypothesisId: 'H2', message: 'still-open' }),
    });
    expect(postAfterFixed.status).toBe(204);

    const left = await app.request(`/api/v1/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'agent' }),
    });
    expect(left.status).toBe(200);
    const stoppedRes = await app.request(`/api/v1/sessions/${session.id}/debug`);
    expect(stoppedRes.status).toBe(200);
    const stopped = (await stoppedRes.json()) as { status: string; ingestRunning: boolean };
    expect(stopped.status).toBe('stopped');
    expect(stopped.ingestRunning).toBe(false);

    const logsAfterLeave = await app.request(`/api/v1/sessions/${session.id}/debug/logs`);
    expect(logsAfterLeave.status).toBe(200);
    const leftover = ((await logsAfterLeave.json()) as { lines: string[] }).lines;
    expect(leftover.some((l) => l.includes('ok'))).toBe(true);

    const reenter = await app.request(`/api/v1/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'debug' }),
    });
    expect(reenter.status).toBe(200);
    const again = await app.request(`/api/v1/sessions/${session.id}/debug`);
    const againBody = (await again.json()) as { logPathRel: string; ingestRunning: boolean };
    expect(againBody.ingestRunning).toBe(true);
    expect(againBody.logPathRel).toBe(dbg.logPathRel);
  });
});

describe('harness-web Changes + ModeRecommender', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-web-changes-'));
  writeFileSync(join(workspace, 'README.md'), '# changes\n');
  const sessionsRoot = join(workspace, 'sessions');
  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'agent',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot });
  const runtime = createAgentRuntime(config, {
    sessionStore,
    auditLog: new AuditLog(join(workspace, 'audit-changes.db')),
    permissionBroker: new PermissionBroker(),
  });
  const app = createHarnessApp({ config, runtime, sessionStore });

  it('records file_changed and lists changes after write', async () => {
    const session = await runtime.createSession({ workspace, mode: 'agent' });
    const events: Array<{ type: string; payload?: unknown }> = [];
    for await (const e of runtime.sendMessage(
      session.id,
      { message: 'write changed.txt <<<hello-diff>>>' },
      { sessionId: session.id, mode: 'agent', workspace },
    )) {
      events.push(e);
    }
    expect(events.some((e) => e.type === 'file_changed')).toBe(true);
    const change = events.find((e) => e.type === 'file_changed')?.payload as {
      path?: string;
      unifiedDiff?: string;
    };
    expect(change.path).toBe('changed.txt');
    expect(change.unifiedDiff).toContain('+hello-diff');

    const res = await app.request(`/api/v1/sessions/${session.id}/changes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      changes: Array<{ path: string; operation: string }>;
    };
    expect(body.changes.some((c) => c.path === 'changed.txt' && c.operation === 'write')).toBe(
      true,
    );
  });

  it('reject restores baseline; accept re-applies after', async () => {
    const session = await runtime.createSession({ workspace, mode: 'agent' });
    for await (const _ of runtime.sendMessage(
      session.id,
      { message: 'write review-me.txt <<<agent-content>>>' },
      { sessionId: session.id, mode: 'agent', workspace },
    )) {
      // drain
    }
    expect(readFileSync(join(workspace, 'review-me.txt'), 'utf-8')).toBe('agent-content');

    const list1 = await app.request(`/api/v1/sessions/${session.id}/changes`);
    const body1 = (await list1.json()) as {
      changes: Array<{ path: string; disposition?: string; reviewable?: boolean }>;
    };
    const row = body1.changes.find((c) => c.path === 'review-me.txt');
    expect(row?.disposition).toBe('pending');
    expect(row?.reviewable).toBe(true);

    const rej = await app.request(`/api/v1/sessions/${session.id}/changes/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'review-me.txt' }),
    });
    expect(rej.status).toBe(200);
    const rejBody = (await rej.json()) as { change: { disposition: string } };
    expect(rejBody.change.disposition).toBe('rejected');
    expect(existsSync(join(workspace, 'review-me.txt'))).toBe(false);

    const acc = await app.request(`/api/v1/sessions/${session.id}/changes/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'review-me.txt' }),
    });
    expect(acc.status).toBe(200);
    expect(readFileSync(join(workspace, 'review-me.txt'), 'utf-8')).toBe('agent-content');

    const bad = await app.request(`/api/v1/sessions/${session.id}/changes/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'never-written.txt' }),
    });
    expect(bad.status).toBe(400);
  });

  it('does not auto-emit mode_suggested (model calls SuggestMode instead)', async () => {
    const session = await runtime.createSession({ workspace, mode: 'agent' });
    const events: Array<{ type: string; payload?: unknown }> = [];
    for await (const e of runtime.sendMessage(
      session.id,
      { message: 'what does this README explain?' },
      { sessionId: session.id, mode: 'agent', workspace },
    )) {
      events.push(e);
    }
    expect(events.some((e) => e.type === 'mode_suggested')).toBe(false);
    expect(runtime.getSession(session.id)?.mode).toBe('agent');
    expect(events.some((e) => e.type === 'mode_changed')).toBe(false);
  });
});

describe('harness-web §12 four-mode smoke', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-web-modes-'));
  writeFileSync(join(workspace, 'README.md'), '# modes\n');
  const sessionsRoot = join(workspace, 'sessions');
  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'plan',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot });
  const runtime = createAgentRuntime(config, {
    sessionStore,
    auditLog: new AuditLog(join(workspace, 'audit-modes.db')),
    permissionBroker: new PermissionBroker(),
  });

  it('Plan confirm → write allow；切回 Ask 仍 deny；mode_change 保留历史', async () => {
    const session = await runtime.createSession({ workspace, mode: 'plan' });
    const { PlanStore } = await import('@ciro-code/harness-core');
    const store = new PlanStore({ sessionsRoot });
    const plan = store.create(session.id, {
      title: 'One file',
      markdown: 'Write hello.txt',
    });

    // Confirm 前 write deny
    const before: Array<{ type: string }> = [];
    for await (const e of runtime.sendMessage(
      session.id,
      { message: 'write blocked.txt <<<no>>>' },
      { sessionId: session.id, mode: 'plan', workspace },
    )) {
      before.push(e);
    }
    expect(before.some((e) => e.type === 'error')).toBe(true);
    expect(existsSync(join(workspace, 'blocked.txt'))).toBe(false);

    await runtime.confirmPlan(session.id, plan.planId);
    expect(runtime.getSession(session.id)?.mode).toBe('agent');

    const after: Array<{ type: string }> = [];
    for await (const e of runtime.sendMessage(
      session.id,
      { message: 'write hello.txt <<<ok>>>' },
      { sessionId: session.id, mode: 'agent', workspace },
    )) {
      after.push(e);
    }
    expect(after.some((e) => e.type === 'complete' || e.type === 'file_changed')).toBe(true);
    expect(existsSync(join(workspace, 'hello.txt'))).toBe(true);

    const switched = await runtime.setMode(session.id, 'ask');
    expect(switched?.mode).toBe('ask');
    const events = sessionStore.eventLog?.readEvents(session.id) ?? [];
    expect(events.some((e) => e.type === 'mode_change')).toBe(true);
    expect(events.some((e) => e.type === 'message')).toBe(true);

    const askDeny: Array<{ type: string }> = [];
    for await (const e of runtime.sendMessage(
      session.id,
      { message: 'write again.txt <<<no>>>' },
      { sessionId: session.id, mode: 'ask', workspace },
    )) {
      askDeny.push(e);
    }
    expect(askDeny.some((e) => e.type === 'error')).toBe(true);
    expect(existsSync(join(workspace, 'again.txt'))).toBe(false);
  });
});

describe('harness-web session hygiene C4c', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-hygiene-'));
  writeFileSync(join(workspace, 'README.md'), '# hygiene\n');
  const sessionsRoot = join(workspace, 'sessions');
  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'ask',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot });
  const runtime = createAgentRuntime(config, {
    sessionStore,
    auditLog: new AuditLog(join(workspace, 'audit.db')),
    permissionBroker: new PermissionBroker(),
  });
  const app = createHarnessApp({ config, runtime, sessionStore });

  it('PATCH title persists and list returns title', async () => {
    const created = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace, mode: 'ask' }),
    });
    const session = (await created.json()) as { id: string };
    sessionStore.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'hi',
      messageId: 'seed',
    });

    const patch = await app.request(`/api/v1/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'My Topic' }),
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { title?: string };
    expect(body.title).toBe('My Topic');

    const list = await app.request('/api/v1/sessions');
    const sessions = (await list.json()) as Array<{ id: string; title?: string }>;
    expect(sessions.find((s) => s.id === session.id)?.title).toBe('My Topic');
  });

  it('rewind drops later messages; resume stays clean', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'user',
      content: 'q1',
      messageId: 'u1',
    });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'assistant',
      content: 'a1',
      messageId: 'a1',
    });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'user',
      content: 'q2',
      messageId: 'u2',
    });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'assistant',
      content: 'a2',
      messageId: 'a2',
    });

    const res = await app.request(`/api/v1/sessions/${created.id}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beforeMessageId: 'u2' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages.map((m) => m.content)).toEqual(['q1', 'a1']);

    sessionStore.delete(created.id);
    const resumed = await runtime.resumeSession(created.id);
    expect(resumed.messages.map((m) => m.content)).toEqual(['q1', 'a1']);
  });

  it('fork truncates then streams new turn', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'user',
      content: 'old',
      messageId: 'u1',
    });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'assistant',
      content: 'reply',
      messageId: 'a1',
    });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'user',
      content: 'replace-me',
      messageId: 'u2',
    });

    const res = await app.request(`/api/v1/sessions/${created.id}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ fromMessageId: 'u2', message: 'new question' }),
    });
    expect(res.status).toBe(200);
    const events = await collectSse(res);
    expect(events.some((e) => e.type === 'complete' || e.type === 'token')).toBe(true);

    const stored = sessionStore.eventLog?.readEvents(created.id) ?? [];
    expect(stored.some((e) => e.messageId === 'u2' && e.content === 'replace-me')).toBe(false);
    expect(stored.some((e) => e.type === 'fork')).toBe(true);
  });

  it('fork-chat creates new session; source unchanged; busy source ok', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    await runtime.setSessionTitle(created.id, 'Main');
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'user',
      content: 'q1',
      messageId: 'u1',
    });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'assistant',
      content: 'a1',
      messageId: 'a1',
    });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'user',
      content: 'q2',
      messageId: 'u2',
    });
    sessionStore.appendEvent(created.id, {
      type: 'message',
      role: 'assistant',
      content: 'a2',
      messageId: 'a2',
    });

    (
      runtime as unknown as { busySessions: Set<string> }
    ).busySessions.add(created.id);

    const res = await app.request(`/api/v1/sessions/${created.id}/fork-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ throughMessageId: 'a1' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      session: { id: string; title?: string };
      messages: Array<{ content: string }>;
    };
    expect(body.session.id).not.toBe(created.id);
    expect(body.session.title).toMatch(/^Fork ·/);
    expect(body.messages.map((m) => m.content)).toEqual(['q1', 'a1']);

    (
      runtime as unknown as { busySessions: Set<string> }
    ).busySessions.delete(created.id);

    const srcResume = await runtime.resumeSession(created.id);
    expect(srcResume.messages.map((m) => m.content)).toEqual(['q1', 'a1', 'q2', 'a2']);
  });

  it('rewind returns 409 when session busy', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    (
      runtime as unknown as { busySessions: Set<string> }
    ).busySessions.add(created.id);
    const res = await app.request(`/api/v1/sessions/${created.id}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beforeMessageId: 'u1' }),
    });
    expect(res.status).toBe(409);
    (
      runtime as unknown as { busySessions: Set<string> }
    ).busySessions.delete(created.id);
  });
});

describe('harness-web multi-session C4d', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-c4d-'));
  writeFileSync(join(workspace, 'README.md'), '# c4d\n');
  writeFileSync(join(workspace, 'note.txt'), 'note\n');
  const sessionsRoot = join(workspace, 'sessions');
  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'ask',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot });
  const runtime = createAgentRuntime(config, {
    sessionStore,
    auditLog: new AuditLog(join(workspace, 'audit.db')),
    permissionBroker: new PermissionBroker(),
  });
  const app = createHarnessApp({ config, runtime, sessionStore });

  it('two parallel SSE sends do not mix conversationId', async () => {
    const a = await runtime.createSession({ workspace, mode: 'ask' });
    const b = await runtime.createSession({ workspace, mode: 'ask' });
    const [resA, resB] = await Promise.all([
      app.request(`/api/v1/chat/${a.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: 'Read README.md', mode: 'ask' }),
      }),
      app.request(`/api/v1/chat/${b.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: 'Read note.txt', mode: 'ask' }),
      }),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const [eventsA, eventsB] = await Promise.all([collectSse(resA), collectSse(resB)]);
    expect(eventsA.every((e) => (e as { conversationId?: string }).conversationId === a.id)).toBe(
      true,
    );
    expect(eventsB.every((e) => (e as { conversationId?: string }).conversationId === b.id)).toBe(
      true,
    );
    expect(eventsA.some((e) => e.type === 'complete' || e.type === 'token')).toBe(true);
    expect(eventsB.some((e) => e.type === 'complete' || e.type === 'token')).toBe(true);
  });

  it('second send on same session returns 409', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    (
      runtime as unknown as { busySessions: Set<string> }
    ).busySessions.add(created.id);
    const res = await app.request(`/api/v1/chat/${created.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: 'Read README.md', mode: 'ask' }),
    });
    expect(res.status).toBe(409);
    (
      runtime as unknown as { busySessions: Set<string> }
    ).busySessions.delete(created.id);
  });

  it('C4d-S3: attach while streaming returns snapshot and completes', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    const sendRes = await app.request(`/api/v1/chat/${created.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: 'Read README.md', mode: 'ask' }),
    });
    expect(sendRes.status).toBe(200);
    // 必须开始读 body，streamSSE 才会跑 sendMessage
    const sendCollect = collectSse(sendRes);
    for (let i = 0; i < 50 && !runtime.isSessionBusy(created.id); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(runtime.isSessionBusy(created.id)).toBe(true);

    const attachRes = await app.request(`/api/v1/chat/${created.id}/attach`, {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
    });
    expect(attachRes.status).toBe(200);
    const attached = await collectSse(attachRes);
    expect(attached.some((e) => e.type === 'attach_snapshot')).toBe(true);
    expect(attached.some((e) => e.type === 'complete' || e.type === 'token')).toBe(true);
    await sendCollect;
  });

  it('O3: attach with fromSeq skips snapshot', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    const sendRes = await app.request(`/api/v1/chat/${created.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: 'Read README.md', mode: 'ask' }),
    });
    expect(sendRes.status).toBe(200);
    const sendCollect = collectSse(sendRes);
    for (let i = 0; i < 50 && !runtime.isSessionBusy(created.id); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(runtime.isSessionBusy(created.id)).toBe(true);

    const attachRes = await app.request(`/api/v1/chat/${created.id}/attach?fromSeq=1`, {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
    });
    expect(attachRes.status).toBe(200);
    const attached = await collectSse(attachRes);
    expect(attached.some((e) => e.type === 'attach_snapshot')).toBe(false);
    expect(
      attached.every((e) => typeof e.seq !== 'number' || e.seq >= 1),
    ).toBe(true);
    await sendCollect;
  });

  it('O3: sessions/events delivers busy then idle', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    const eventsRes = await app.request('/api/v1/sessions/events', {
      headers: { Accept: 'text/event-stream' },
    });
    expect(eventsRes.status).toBe(200);

    const collected: Array<{ type: string }> = [];
    const reader = eventsRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawBusy = false;
    const readUntilIdle = (async () => {
      while (collected.every((e) => e.type !== 'session_idle')) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.slice(5).trim()) as { type: string };
            collected.push(ev);
            if (ev.type === 'session_busy') sawBusy = true;
          } catch {
            // skip
          }
        }
      }
    })();
    // 等 SSE 回调挂上 subscribe listener，再发 turn
    await new Promise((r) => setTimeout(r, 30));

    const sendRes = await app.request(`/api/v1/chat/${created.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: 'Read README.md', mode: 'ask' }),
    });
    expect(sendRes.status).toBe(200);
    await collectSse(sendRes);
    await Promise.race([
      readUntilIdle,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout waiting idle')), 5000)),
    ]);
    await reader.cancel().catch(() => undefined);
    expect(sawBusy || collected.some((e) => e.type === 'session_busy')).toBe(true);
    expect(collected.some((e) => e.type === 'session_idle')).toBe(true);
  });

  it('auto-title sets title from first user message (mock)', async () => {
    const created = await runtime.createSession({ workspace, mode: 'ask' });
    const send = await app.request(`/api/v1/chat/${created.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: '你是什么模型', mode: 'ask' }),
    });
    expect(send.status).toBe(200);
    await collectSse(send);

    const titled = await app.request(`/api/v1/sessions/${created.id}/auto-title`, {
      method: 'POST',
    });
    expect(titled.status).toBe(200);
    const body = (await titled.json()) as { title?: string };
    expect(body.title).toContain('模型');
  });
});
