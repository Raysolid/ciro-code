import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  toMenuThinkingLevel,
  type ChatImageContent,
  type HarnessMode,
  type ModelRef,
  type ThinkingLevel,
} from '@ciro/harness-shared';
import { readDebugLogTail, clearDebugLog } from '@ciro/harness-core';
import { toSessionJson, type AppContext } from '../app-context.js';

export function registerSessionRoutes(app: Hono, ctx: AppContext): void {
  const { config, runtime, sessionStore, contextAccountant, providerStore, listSessionsJson } =
    ctx;

  app.post('/api/v1/sessions', async (c) => {
    const body = (await c.req
      .json<{ workspace?: string; mode?: HarnessMode; modelRef?: ModelRef }>()
      .catch(() => ({}))) as {
      workspace?: string;
      mode?: HarnessMode;
      modelRef?: ModelRef;
    };
    const workspace = body.workspace ?? config.workspace;
    const mode = body.mode ?? config.mode;
    const modelRef =
      body.modelRef ?? providerStore.resolveEffectiveModelRef(null) ?? undefined;
    const handle = await runtime.createSession({ workspace, mode, modelRef });
    return c.json(toSessionJson(handle, 0));
  });

  app.get('/api/v1/sessions', (c) => c.json(listSessionsJson()));

  /** O3：workspace 级 busy/idle 控制面（替换 UI 多路静默 attach） */
  app.get('/api/v1/sessions/events', (c) => {
    return streamSSE(c, async (stream) => {
      stream.onAbort(() => undefined);
      try {
        for await (const envelope of runtime.subscribeSessionActivity()) {
          if (stream.aborted) break;
          await stream.writeSSE({
            event: envelope.type,
            data: JSON.stringify(envelope),
          });
        }
      } catch {
        // 连接关闭或 runtime 结束
      }
    });
  });

  app.post('/api/v1/sessions/:sessionId/resume', async (c) => {
    const sessionId = c.req.param('sessionId');
    try {
      const out = await runtime.resumeSession(sessionId);
      return c.json({
        session: toSessionJson(out.session),
        messageCount: out.messageCount,
        eventsReplayed: out.eventsReplayed,
        stoppedAtBoundary: out.stoppedAtBoundary,
        contextUsage: out.contextUsage,
        messages: out.messages,
        ...(out.confirmedPlanId ? { confirmedPlanId: out.confirmedPlanId } : {}),
        type: 'session_recovered',
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  app.get('/api/v1/sessions/:sessionId', (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.json(toSessionJson(session));
  });

  app.get('/api/v1/sessions/:sessionId/context', (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const snap =
      runtime.getContextUsage(sessionId) ??
      contextAccountant.get(sessionId) ??
      contextAccountant.refresh(sessionId, {
        system: `mode:${session.mode}`,
        tools: config.tools.join('\n'),
        conversation: '',
      });
    return c.json(snap);
  });

  app.post('/api/v1/sessions/:sessionId/compact', async (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const body = (await c.req
      .json<{ method?: 'micro' | 'session-memory' | 'full' | 'auto' }>()
      .catch(() => ({}))) as { method?: 'micro' | 'session-memory' | 'full' | 'auto' };
    try {
      const out = await runtime.compactSession(sessionId, { method: body.method ?? 'auto' });
      return c.json(out);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/v1/sessions/:sessionId/events', (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const events = sessionStore.eventLog?.readEvents(sessionId) ?? [];
    return c.json({ sessionId, events });
  });

  app.get('/api/v1/sessions/:sessionId/plans', (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.json({ sessionId, plans: runtime.listPlans(sessionId) });
  });

  app.get('/api/v1/sessions/:sessionId/changes', (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.json({ sessionId, changes: runtime.listFileChanges(sessionId) });
  });

  app.post('/api/v1/sessions/:sessionId/changes/accept', async (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const body = (await c.req.json<{ path?: string }>().catch(() => ({}))) as {
      path?: string;
    };
    const path = typeof body.path === 'string' ? body.path.trim() : '';
    if (!path) {
      return c.json({ error: 'path is required' }, 400);
    }
    try {
      const change = runtime.acceptFileChange(sessionId, path);
      return c.json({ sessionId, change });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, message.includes('Session not found') ? 404 : 400);
    }
  });

  app.post('/api/v1/sessions/:sessionId/changes/reject', async (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const body = (await c.req.json<{ path?: string }>().catch(() => ({}))) as {
      path?: string;
    };
    const path = typeof body.path === 'string' ? body.path.trim() : '';
    if (!path) {
      return c.json({ error: 'path is required' }, 400);
    }
    try {
      const change = runtime.rejectFileChange(sessionId, path);
      return c.json({ sessionId, change });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, message.includes('Session not found') ? 404 : 400);
    }
  });

  app.get('/api/v1/sessions/:sessionId/plans/:planId', (c) => {
    const sessionId = c.req.param('sessionId');
    const planId = c.req.param('planId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const plan = runtime.getPlan(sessionId, planId);
    if (!plan) return c.json({ error: 'Plan not found' }, 404);
    return c.json(plan);
  });

  app.post('/api/v1/sessions/:sessionId/plans/:planId/confirm', async (c) => {
    const sessionId = c.req.param('sessionId');
    const planId = c.req.param('planId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    try {
      const out = await runtime.confirmPlan(sessionId, planId);
      return c.json({
        session: toSessionJson(out.session),
        plan: out.plan,
        mode: out.session.mode,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/api/v1/sessions/:sessionId/plans/:planId/save-to-workspace', async (c) => {
    const sessionId = c.req.param('sessionId');
    const planId = c.req.param('planId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    try {
      const out = await runtime.savePlanToWorkspace(sessionId, planId);
      return c.json({ pathRel: out.pathRel, plan: out.plan });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/v1/sessions/:sessionId/debug/logs', (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const dbg = runtime.getDebugSession(sessionId);
    if (!dbg?.logPath) {
      return c.json({ error: 'No active debug session', mode: session.mode }, 404);
    }
    const lines = readDebugLogTail(dbg.logPath);
    return c.json({ lines });
  });

  app.delete('/api/v1/sessions/:sessionId/debug/logs', (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const dbg = runtime.getDebugSession(sessionId);
    if (!dbg?.logPath) {
      return c.json({ error: 'No active debug session', mode: session.mode }, 404);
    }
    clearDebugLog(dbg.logPath);
    return c.json({ lines: [] });
  });

  app.get('/api/v1/sessions/:sessionId/debug', (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    const dbg = runtime.getDebugSession(sessionId);
    if (!dbg) {
      return c.json({ error: 'No active debug session', mode: session.mode }, 404);
    }
    return c.json(dbg);
  });

  app.post('/api/v1/sessions/:sessionId/debug/proceed', async (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    try {
      const dbg = await runtime.proceedDebug(sessionId);
      return c.json(dbg);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/api/v1/sessions/:sessionId/debug/mark-fixed', async (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    try {
      const dbg = await runtime.markDebugFixed(sessionId);
      return c.json(dbg);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.patch('/api/v1/sessions/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      mode?: HarnessMode;
      modelRef?: ModelRef | null;
      title?: string | null;
      thinkingLevel?: ThinkingLevel;
      maxMode?: boolean;
    }>();
    const existing = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!existing) {
      return c.json({ error: 'Session not found' }, 404);
    }

    let updated = existing;
    if (body.title !== undefined) {
      const next = await runtime.setSessionTitle(
        sessionId,
        body.title === null ? undefined : body.title,
      );
      if (!next) {
        return c.json({ error: 'Session not found' }, 404);
      }
      updated = next;
    }
    if (body.mode) {
      const next = await runtime.setMode(sessionId, body.mode);
      if (!next) {
        return c.json({ error: 'Session not found' }, 404);
      }
      updated = next;
    }
    if (body.modelRef !== undefined) {
      const next = await runtime.setModelRef(
        sessionId,
        body.modelRef === null ? undefined : body.modelRef,
      );
      if (!next) {
        return c.json({ error: 'Session not found' }, 404);
      }
      updated = next;
    }
    if (body.thinkingLevel !== undefined) {
      const next = await runtime.setThinkingLevel(
        sessionId,
        toMenuThinkingLevel(body.thinkingLevel),
      );
      if (!next) {
        return c.json({ error: 'Session not found' }, 404);
      }
      updated = next;
    }
    if (body.maxMode !== undefined) {
      const next = await runtime.setMaxMode(sessionId, body.maxMode);
      if (!next) {
        return c.json({ error: 'Session not found' }, 404);
      }
      updated = next;
    }
    return c.json(toSessionJson(updated));
  });

  app.post('/api/v1/sessions/:sessionId/auto-title', async (c) => {
    const sessionId = c.req.param('sessionId');
    const existing = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!existing) {
      return c.json({ error: 'Session not found' }, 404);
    }
    try {
      const { generateSessionTitle } = await import('../session-auto-title.js');
      const title = await generateSessionTitle({
        store: sessionStore,
        providerStore,
        sessionId,
        agentBackend: config.agentBackend,
      });
      const next = await runtime.setSessionTitle(sessionId, title);
      if (!next) {
        return c.json({ error: 'Session not found' }, 404);
      }
      return c.json(toSessionJson(next));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/v1/sessions/:sessionId/rewind', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{ beforeMessageId?: string }>();
    if (!body.beforeMessageId) {
      return c.json({ error: 'beforeMessageId required' }, 400);
    }
    const existing = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!existing) {
      return c.json({ error: 'Session not found' }, 404);
    }
    if (runtime.isSessionBusy(sessionId)) {
      return c.json({ error: 'Session is streaming', code: 'SESSION_BUSY' }, 409);
    }
    try {
      const out = await runtime.rewindSession(sessionId, body.beforeMessageId);
      return c.json({
        session: toSessionJson(out.session),
        messages: out.messages,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('SESSION_BUSY')) {
        return c.json({ error: msg, code: 'SESSION_BUSY' }, 409);
      }
      if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 400);
    }
  });

  /** C4e：Cursor 式新会话克隆（与同会话破坏性 /fork 分离） */
  app.post('/api/v1/sessions/:sessionId/fork-chat', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{ throughMessageId?: string }>();
    if (!body.throughMessageId) {
      return c.json({ error: 'throughMessageId required' }, 400);
    }
    const existing = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!existing) {
      return c.json({ error: 'Session not found' }, 404);
    }
    try {
      const out = await runtime.forkChatSession(sessionId, body.throughMessageId);
      return c.json(
        {
          session: toSessionJson(out.session),
          messages: out.messages,
        },
        201,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 400);
    }
  });

  app.post('/api/v1/sessions/:sessionId/fork', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      fromMessageId?: string;
      message?: string;
      messageId?: string;
      mode?: HarnessMode;
      modelRef?: ModelRef;
      images?: ChatImageContent[];
    }>();
    const hasImages = Boolean(body.images?.length);
    if (!body.fromMessageId || (!body.message?.trim() && !hasImages)) {
      return c.json({ error: 'fromMessageId and message (or images) required' }, 400);
    }
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    if (runtime.isSessionBusy(sessionId)) {
      return c.json({ error: 'Session is streaming', code: 'SESSION_BUSY' }, 409);
    }

    try {
      await runtime.prepareFork(sessionId, body.fromMessageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('SESSION_BUSY')) {
        return c.json({ error: msg, code: 'SESSION_BUSY' }, 409);
      }
      if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 400);
    }

    let mode = body.mode ?? session.mode;
    if (body.mode && body.mode !== session.mode) {
      const updated = await runtime.setMode(sessionId, body.mode);
      if (updated) mode = updated.mode;
    }
    if (body.modelRef) {
      await runtime.setModelRef(sessionId, body.modelRef);
    }

    const turnCtx = {
      sessionId,
      mode,
      workspace: session.workspace,
    };

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => undefined);
      try {
        for await (const envelope of runtime.sendMessage(
          sessionId,
          {
            message: (body.message ?? '').trim(),
            messageId: body.messageId,
            images: body.images,
          },
          turnCtx,
        )) {
          if (stream.aborted) break;
          await stream.writeSSE({
            event: envelope.type,
            data: JSON.stringify(envelope),
          });
        }
      } catch (err) {
        if (stream.aborted) return;
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            type: 'error',
            ts: Date.now(),
            conversationId: sessionId,
            payload: { message: err instanceof Error ? err.message : String(err) },
          }),
        });
      }
    });
  });

  app.delete('/api/v1/sessions/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');
    await runtime.deleteSession(sessionId);
    sessionStore.purge(sessionId);
    return c.json({ ok: true });
  });

  app.get('/api/v1/sessions/:sessionId/subagents', (c) => {
    const sessionId = c.req.param('sessionId');
    return c.json({ subagents: runtime.listSubagents(sessionId) });
  });

  app.get('/api/v1/sessions/:sessionId/subagents/:taskId', (c) => {
    const sessionId = c.req.param('sessionId');
    const taskId = c.req.param('taskId');
    const view = runtime.getSubagent(sessionId, taskId);
    if (!view) return c.json({ error: 'Subagent run not found' }, 404);
    return c.json(view);
  });

  app.get('/api/v1/sessions/:sessionId/subagents/:taskId/events', (c) => {
    const sessionId = c.req.param('sessionId');
    const taskId = c.req.param('taskId');
    const view = runtime.getSubagent(sessionId, taskId);
    if (!view) return c.json({ error: 'Subagent run not found' }, 404);
    return streamSSE(c, async (stream) => {
      const ac = new AbortController();
      stream.onAbort(() => ac.abort());
      try {
        for await (const event of runtime.streamSubagentEvents(
          sessionId,
          taskId,
          ac.signal,
        )) {
          if (stream.aborted || ac.signal.aborted) break;
          await stream.writeSSE({
            event: String(event.type ?? 'message'),
            data: JSON.stringify(event),
          });
        }
      } catch {
        // client closed or runtime ended
      }
    });
  });

  app.post('/api/v1/sessions/:sessionId/subagents/:taskId/abort', async (c) => {
    const sessionId = c.req.param('sessionId');
    const taskId = c.req.param('taskId');
    const ok = await runtime.abortSubagent(sessionId, taskId);
    return c.json({ ok });
  });

  app.delete('/api/v1/sessions/:sessionId/subagents', (c) => {
    const sessionId = c.req.param('sessionId');
    runtime.clearSubagents(sessionId);
    return c.json({ ok: true });
  });
}
