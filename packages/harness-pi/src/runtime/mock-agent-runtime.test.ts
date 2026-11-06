import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MockAgentRuntime } from './mock-agent-runtime.js';
import { createHarnessConfig } from '@ciro-code/harness-shared';
import { PlanStore, SessionStore } from '@ciro-code/harness-core';

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iter) items.push(item);
  return items;
}

describe('MockAgentRuntime smoke', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-mock-'));
  writeFileSync(join(workspace, 'README.md'), '# Hello Harness');
  writeFileSync(join(workspace, 'note.txt'), 'TODO: phase1');
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'harness-mock-sess-'));

  const config = createHarnessConfig({
    workspace,
    mode: 'ask',
    agentBackend: 'mock',
  });

  function runtime(store?: SessionStore) {
    return new MockAgentRuntime(config, {
      sessionStore: store ?? new SessionStore({ sessionsRoot }),
    });
  }

  it('Ask mode reads file via mock adapter', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'ask' });
    const events = await collect(
      rt.sendMessage(
        session.id,
        { message: 'Read README.md' },
        { sessionId: session.id, mode: 'ask', workspace },
      ),
    );
    expect(events.some((e) => e.type === 'thinking')).toBe(true);
    expect(events.some((e) => e.type === 'tool_call_start')).toBe(true);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(events.some((e) => e.type === 'context_usage')).toBe(true);
  });

  it('resume rebuilds tool timeline from events', async () => {
    const store = new SessionStore({ sessionsRoot: mkdtempSync(join(tmpdir(), 'harness-tl-')) });
    const rt = runtime(store);
    const session = await rt.createSession({ workspace, mode: 'ask' });
    await collect(
      rt.sendMessage(
        session.id,
        { message: 'Read README.md' },
        { sessionId: session.id, mode: 'ask', workspace },
      ),
    );
    const resumed = await rt.resumeSession(session.id);
    const assistant = resumed.messages.find((m) => m.role === 'assistant');
    expect(assistant?.timeline?.some((t) => t.kind === 'tool' && t.toolName === 'read')).toBe(true);
  });

  it('resume returns confirmedPlanId after confirm', async () => {
    const sessionsRoot = mkdtempSync(join(tmpdir(), 'harness-plan-resume-'));
    const store = new SessionStore({ sessionsRoot });
    const rt = runtime(store);
    const session = await rt.createSession({ workspace, mode: 'plan' });
    const plan = new PlanStore({ sessionsRoot }).create(session.id, {
      title: 'Demo',
      markdown: '## Do\n',
      planId: 'abcd1234',
    });
    await rt.confirmPlan(session.id, plan.planId);
    const resumed = await rt.resumeSession(session.id);
    expect(resumed.confirmedPlanId).toBe('abcd1234');
  });

  it('Ask mode denies write tool', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'ask' });
    const events = await collect(
      rt.sendMessage(
        session.id,
        { message: 'Please write to file.txt' },
        { sessionId: session.id, mode: 'ask', workspace },
      ),
    );
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('Ask mode lists files', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'ask' });
    const events = await collect(
      rt.sendMessage(
        session.id,
        { message: 'list_files .' },
        { sessionId: session.id, mode: 'ask', workspace },
      ),
    );
    expect(events.some((e) => e.type === 'tool_call_start')).toBe(true);
    const start = events.find((e) => e.type === 'tool_call_start');
    expect((start?.payload as { toolName?: string }).toolName).toBe('list_files');
  });

  it('Ask mode greps files', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'ask' });
    const events = await collect(
      rt.sendMessage(
        session.id,
        { message: 'grep TODO .' },
        { sessionId: session.id, mode: 'ask', workspace },
      ),
    );
    expect(events.some((e) => e.type === 'tool_call_start')).toBe(true);
  });

  it('shares SessionStore with caller', async () => {
    const store = new SessionStore({ sessionsRoot });
    const rt = runtime(store);
    const session = await rt.createSession({ workspace, mode: 'ask' });
    expect(store.get(session.id)?.id).toBe(session.id);
    await rt.setMode(session.id, 'agent');
    expect(store.get(session.id)?.mode).toBe('agent');
  });

  it('abort stops in-flight mock turn', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'ask' });
    const iter = rt.sendMessage(
      session.id,
      { message: 'hello world' },
      { sessionId: session.id, mode: 'ask', workspace },
    );
    const first = await iter.next();
    await rt.abort(session.id);
    const rest = await collect(iter);
    const all = first.done ? rest : [first.value!, ...rest];
    expect(all.length).toBeGreaterThan(0);
  });

  it('agent write can update MEMORY.md via mock', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'agent' });
    const events = await collect(
      rt.sendMessage(
        session.id,
        {
          message:
            'write .ciro/memory/MEMORY.md <<<# Workspace Memory\n\nUse Vitest.\n>>>',
        },
        { sessionId: session.id, mode: 'agent', workspace },
      ),
    );
    expect(events.some((e) => e.type === 'tool_call_result')).toBe(true);
    expect(rt.getContextUsage(session.id)?.buckets.length).toBeGreaterThanOrEqual(3);
  });

  it('C4d: parallel sessions do not cross envelopes', async () => {
    const rt = runtime();
    const a = await rt.createSession({ workspace, mode: 'ask' });
    const b = await rt.createSession({ workspace, mode: 'ask' });
    const [eventsA, eventsB] = await Promise.all([
      collect(
        rt.sendMessage(
          a.id,
          { message: 'Read README.md' },
          { sessionId: a.id, mode: 'ask', workspace },
        ),
      ),
      collect(
        rt.sendMessage(
          b.id,
          { message: 'Read note.txt' },
          { sessionId: b.id, mode: 'ask', workspace },
        ),
      ),
    ]);
    expect(eventsA.length).toBeGreaterThan(0);
    expect(eventsB.length).toBeGreaterThan(0);
    expect(eventsA.every((e) => e.conversationId === a.id)).toBe(true);
    expect(eventsB.every((e) => e.conversationId === b.id)).toBe(true);
    expect(eventsA.some((e) => e.type === 'complete')).toBe(true);
    expect(eventsB.some((e) => e.type === 'complete')).toBe(true);
  });

  it('C4d: same session second send throws SESSION_BUSY', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'ask' });
    (rt as unknown as { busySessions: Set<string> }).busySessions.add(session.id);
    await expect(
      collect(
        rt.sendMessage(
          session.id,
          { message: 'Read note.txt' },
          { sessionId: session.id, mode: 'ask', workspace },
        ),
      ),
    ).rejects.toThrow(/SESSION_BUSY/);
    (rt as unknown as { busySessions: Set<string> }).busySessions.delete(session.id);
  });

  it('steerInFlight succeeds while busy; sendMessage still SESSION_BUSY; idle throws SESSION_IDLE', async () => {
    const store = new SessionStore({ sessionsRoot: mkdtempSync(join(tmpdir(), 'harness-steer-')) });
    const rt = runtime(store);
    const session = await rt.createSession({ workspace, mode: 'ask' });
    await expect(rt.steerInFlight(session.id, { message: 'go left' })).rejects.toThrow(
      /SESSION_IDLE/,
    );

    (rt as unknown as { busySessions: Set<string> }).busySessions.add(session.id);
    const steered = await rt.steerInFlight(session.id, {
      message: 'go left',
      messageId: 'steer-1',
    });
    expect(steered.messageId).toBe('steer-1');
    await expect(
      collect(
        rt.sendMessage(
          session.id,
          { message: 'Read note.txt' },
          { sessionId: session.id, mode: 'ask', workspace },
        ),
      ),
    ).rejects.toThrow(/SESSION_BUSY/);
    (rt as unknown as { busySessions: Set<string> }).busySessions.delete(session.id);

    const events = store.eventLog?.readEvents(session.id) ?? [];
    expect(
      events.some(
        (e) =>
          e.type === 'message' &&
          (e as { role?: string; messageId?: string; deliverAs?: string }).role ===
            'user' &&
          (e as { messageId?: string }).messageId === 'steer-1' &&
          (e as { deliverAs?: string }).deliverAs === 'steer',
      ),
    ).toBe(true);

    (rt as unknown as { busySessions: Set<string> }).busySessions.add(session.id);
    await rt.steerInFlight(session.id, {
      message: 'later',
      messageId: 'fu-1',
      deliverAs: 'followUp',
    });
    (rt as unknown as { busySessions: Set<string> }).busySessions.delete(session.id);
    const after = store.eventLog?.readEvents(session.id) ?? [];
    expect(
      after.some(
        (e) =>
          (e as { messageId?: string; deliverAs?: string }).messageId === 'fu-1' &&
          (e as { deliverAs?: string }).deliverAs === 'followUp',
      ),
    ).toBe(true);
  });

  it('C4d: abort A does not clear B busy/push', async () => {
    const rt = runtime();
    const a = await rt.createSession({ workspace, mode: 'ask' });
    const b = await rt.createSession({ workspace, mode: 'ask' });
    const pushes = (rt as unknown as { activePushes: Map<string, (e: unknown) => void> })
      .activePushes;
    const busy = (rt as unknown as { busySessions: Set<string> }).busySessions;
    const noop = () => undefined;
    pushes.set(b.id, noop);
    busy.add(b.id);
    await rt.abort(a.id);
    expect(busy.has(b.id)).toBe(true);
    expect(pushes.has(b.id)).toBe(true);
    busy.delete(b.id);
    pushes.delete(b.id);
  });

  it('C4d-S3: attach while idle throws; busy turn can attach after consumer drop', async () => {
    const rt = runtime();
    const idle = await rt.createSession({ workspace, mode: 'ask' });
    await expect(collect(rt.attachMessage(idle.id))).rejects.toThrow(/SESSION_IDLE/);

    const session = await rt.createSession({ workspace, mode: 'ask' });
    const iter = rt.sendMessage(
      session.id,
      { message: 'Read README.md' },
      { sessionId: session.id, mode: 'ask', workspace },
    );
    const reader = iter[Symbol.asyncIterator]();
    await reader.next();
    await reader.return?.();
    if (!rt.isSessionBusy(session.id)) {
      // turn 已极短结束：至少验证 idle attach 契约；不断开即 abort 的路径由 e2e 覆盖
      return;
    }
    const attached = await collect(rt.attachMessage(session.id));
    expect(attached.some((e) => e.type === 'attach_snapshot')).toBe(true);
    expect(attached.some((e) => e.type === 'complete' || e.type === 'error')).toBe(true);
  });

  it('O3: attach fromSeq skips snapshot and already-seen hub events', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'ask' });
    const iter = rt.sendMessage(
      session.id,
      { message: 'Read README.md' },
      { sessionId: session.id, mode: 'ask', workspace },
    );
    const reader = iter[Symbol.asyncIterator]();
    const seen: Awaited<ReturnType<typeof reader.next>>['value'][] = [];
    for (let i = 0; i < 8; i++) {
      const step = await reader.next();
      if (step.done) break;
      seen.push(step.value);
    }
    if (!rt.isSessionBusy(session.id)) {
      await reader.return?.();
      return;
    }
    const withSeq = seen.filter(
      (e): e is NonNullable<typeof e> & { seq: number } =>
        e != null && typeof e.seq === 'number',
    );
    expect(withSeq.length).toBeGreaterThan(0);
    const lastSeq = Math.max(...withSeq.map((e) => e.seq));
    const attached = await collect(
      rt.attachMessage(session.id, { fromSeq: lastSeq + 1 }),
    );
    expect(attached.some((e) => e.type === 'attach_snapshot')).toBe(false);
    for (const e of attached) {
      if (typeof e.seq === 'number') {
        expect(e.seq).toBeGreaterThan(lastSeq);
      }
    }
    await reader.return?.();
  });

  it('O3: session activity emits busy then idle around a turn', async () => {
    const rt = runtime();
    const session = await rt.createSession({ workspace, mode: 'ask' });
    const sub = rt.subscribeSessionActivity()[Symbol.asyncIterator]();
    const busyP = sub.next();
    const events = await collect(
      rt.sendMessage(
        session.id,
        { message: 'Read README.md' },
        { sessionId: session.id, mode: 'ask', workspace },
      ),
    );
    expect(events.some((e) => e.type === 'complete' || e.type === 'error')).toBe(true);
    const busy = await busyP;
    expect(busy.value?.type).toBe('session_busy');
    const idle = await sub.next();
    expect(idle.value?.type).toBe('session_idle');
    await sub.return?.(undefined);
  });

  it('C4e: forkChatSession clones through; source unchanged; busy src ok', async () => {
    const store = new SessionStore({
      sessionsRoot: mkdtempSync(join(tmpdir(), 'mock-fork-chat-')),
    });
    const rt = runtime(store);
    const session = await rt.createSession({ workspace, mode: 'ask' });
    await rt.setSessionTitle(session.id, 'Topic');
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'q1',
      messageId: 'u1',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'a1',
      messageId: 'a1',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'q2',
      messageId: 'u2',
    });
    (rt as unknown as { busySessions: Set<string> }).busySessions.add(session.id);
    const out = await rt.forkChatSession(session.id, 'a1');
    (rt as unknown as { busySessions: Set<string> }).busySessions.delete(session.id);
    expect(out.session.id).not.toBe(session.id);
    expect(out.session.title).toBe('Fork · Topic');
    expect(out.messages.map((m) => m.content)).toEqual(['q1', 'a1']);
    const srcMsgs = (
      await rt.resumeSession(session.id)
    ).messages.map((m) => m.content);
    expect(srcMsgs).toEqual(['q1', 'a1', 'q2']);
  });

  it('does not hydrate over a failed debug session', async () => {
    const store = new SessionStore({ sessionsRoot: mkdtempSync(join(tmpdir(), 'harness-dbg-fail-')) });
    const rt = runtime(store);
    const session = await rt.createSession({ workspace, mode: 'ask' });
    store.appendEvent(session.id, {
      type: 'mode_change',
      mode: 'debug',
      debugSessionId: 'oldid',
      logPathRel: '.ciro/debug/debug-oldid.log',
    });
    type DebugMap = Map<
      string,
      {
        handle: null;
        info: {
          debugSessionId: string;
          ingestUrl: string;
          logPath: string;
          logPathRel: string;
          status: string;
          ingestRunning: boolean;
          error?: string;
        };
      }
    >;
    (rt as unknown as { debugSessions: DebugMap }).debugSessions.set(session.id, {
      handle: null,
      info: {
        debugSessionId: '',
        ingestUrl: '',
        logPath: '',
        logPathRel: '',
        status: 'failed',
        ingestRunning: false,
        error: 'boom',
      },
    });
    const info = rt.getDebugSession(session.id);
    expect(info?.status).toBe('failed');
    expect(info?.debugSessionId).toBe('');
  });
});
