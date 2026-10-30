import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionStore, hasApiKey } from '@ciro-code/harness-core';
import { createHarnessConfig } from '@ciro-code/harness-shared';
import { PiAgentRuntime } from './pi-agent-runtime.js';

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iter) items.push(item);
  return items;
}

describe('PiAgentRuntime smoke', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-pi-'));
  writeFileSync(join(workspace, 'README.md'), '# Hello Pi');
  mkdirSync(join(workspace, 'src'));
  writeFileSync(join(workspace, 'src', 'a.ts'), 'export const x = 1;\n');
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'harness-pi-sess-'));

  const config = createHarnessConfig({
    workspace,
    mode: 'ask',
    agentBackend: 'pi',
    llm: { provider: 'env', model: process.env.CIRO_MODEL ?? 'deepseek-chat' },
  });

  it.skipIf(!hasApiKey())(
    'Ask mode reads file via Pi adapter',
    async () => {
      const runtime = new PiAgentRuntime(config, {
        sessionStore: new SessionStore({ sessionsRoot }),
      });
      const session = await runtime.createSession({ workspace, mode: 'ask' });
      const events = await collect(
        runtime.sendMessage(
          session.id,
          { message: 'Read README.md and summarize in one sentence.' },
          { sessionId: session.id, mode: 'ask', workspace },
        ),
      );
      expect(events.some((e) => e.type === 'token' || e.type === 'complete')).toBe(true);
      expect(events.some((e) => e.type === 'context_usage')).toBe(true);
    },
    120_000,
  );

  it('sendMessage errors when provider store has no usable model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-nomodel-'));
    const providersPath = join(root, 'providers.json');
    const keysPath = join(root, 'keys.json');
    writeFileSync(providersPath, JSON.stringify({ providers: [], defaultModelRef: null }), 'utf-8');
    writeFileSync(keysPath, '{}', 'utf-8');
    const { ProviderStore } = await import('@ciro-code/harness-core');
    const runtime = new PiAgentRuntime(config, {
      sessionStore: new SessionStore({ sessionsRoot: mkdtempSync(join(tmpdir(), 'pi-nomodel-s-')) }),
      providerStore: new ProviderStore({ providersPath, keysPath }),
    });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    const events = await collect(
      runtime.sendMessage(
        session.id,
        { message: 'hello' },
        { sessionId: session.id, mode: 'ask', workspace },
      ),
    );
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeTruthy();
    expect((err?.payload as { code?: string }).code).toBe('MODEL_NOT_CONFIGURED');
    expect(events.some((e) => e.type === 'complete')).toBe(false);
    expect(events.some((e) => e.type === 'token')).toBe(false);
  });

  it('creates ask session handle and seeds context buckets', async () => {
    const runtime = new PiAgentRuntime(config, {
      sessionStore: new SessionStore({ sessionsRoot: mkdtempSync(join(tmpdir(), 'pi-sess2-')) }),
    });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    expect(session.mode).toBe('ask');
    expect(runtime.getContextUsage(session.id)?.buckets.length).toBeGreaterThanOrEqual(3);
    expect(runtime.getAvailableTools({ mode: 'ask' }).map((t) => t.name)).toEqual(
      expect.arrayContaining(['read', 'bash', 'list_files', 'grep']),
    );
    expect(runtime.getAvailableTools({ mode: 'ask' }).map((t) => t.name)).not.toContain('write');
    expect(runtime.getAvailableTools({ mode: 'ask' }).map((t) => t.name)).not.toContain(
      'memory_save',
    );
    const agentTools = runtime.getAvailableTools({ mode: 'agent' }).map((t) => t.name);
    expect(agentTools).toEqual(expect.arrayContaining(['write', 'edit', 'bash', 'TodoWrite']));
  });

  it('setMode keeps Pi session and updates tool allowlist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-mode-'));
    const runtime = new PiAgentRuntime(config, {
      sessionStore: new SessionStore({ sessionsRoot: root }),
    });
    const session = await runtime.createSession({ workspace, mode: 'plan' });
    type Entry = { piSession: { getActiveToolNames: () => string[] } };
    const sessions = (runtime as unknown as { sessions: Map<string, Entry> }).sessions;
    const before = sessions.get(session.id)?.piSession;
    expect(before?.getActiveToolNames()).not.toContain('write');
    await runtime.setMode(session.id, 'agent');
    const after = sessions.get(session.id)?.piSession;
    expect(after).toBe(before);
    expect(after?.getActiveToolNames()).toEqual(expect.arrayContaining(['write', 'edit', 'bash']));
    expect(runtime.getSession(session.id)?.mode).toBe('agent');
    await runtime.deleteSession(session.id);
  });

  it('resumeSession seeds text history into Pi messages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-resume-'));
    const store = new SessionStore({ sessionsRoot: root });
    const runtime = new PiAgentRuntime(config, { sessionStore: store });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'first question',
      messageId: 'u1',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'first answer',
      messageId: 'a1',
    });
    await runtime.deleteSession(session.id);

    const resumed = await runtime.resumeSession(session.id);
    expect(resumed.messages.map((m) => m.content)).toEqual(
      expect.arrayContaining(['first question', 'first answer']),
    );
    const entry = (
      runtime as unknown as {
        sessions: Map<string, { piSession: { messages: Array<{ role: string }> } }>;
      }
    ).sessions.get(session.id);
    expect(entry?.piSession.messages.length).toBeGreaterThanOrEqual(2);
    await runtime.deleteSession(session.id);
  });

  it('rewindSession drops later turns and rebuilds Pi history', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-rewind-'));
    const store = new SessionStore({ sessionsRoot: root });
    const runtime = new PiAgentRuntime(config, { sessionStore: store });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
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
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'a2',
      messageId: 'a2',
    });

    const out = await runtime.rewindSession(session.id, 'u2');
    expect(out.messages.map((m) => m.content)).toEqual(['q1', 'a1']);
    expect(store.eventLog!.readEvents(session.id).some((e) => e.type === 'rewind')).toBe(true);

    store.delete(session.id);
    const resumed = await runtime.resumeSession(session.id);
    expect(resumed.messages.map((m) => m.content)).toEqual(['q1', 'a1']);
    await runtime.deleteSession(session.id);
  });

  it('rewindSession rebuilds accounting like resume (keeps summarized + remaining tools)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-rewind-acct-'));
    const store = new SessionStore({ sessionsRoot: root });
    const runtime = new PiAgentRuntime(config, { sessionStore: store });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'before',
      messageId: 'u0',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'early',
      messageId: 'a0',
    });
    store.appendEvent(session.id, {
      type: 'compaction',
      method: 'session-memory',
      summarized: '# Compaction summary\n\nKept intent and files.',
      conversation: '\nUser: recent-tail\nAssistant: ok-tail',
      tokensSaved: 500,
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'after-compact',
      messageId: 'u1',
    });
    store.appendEvent(session.id, {
      type: 'tool_result',
      toolCallId: 't-keep',
      toolName: 'read',
      content: 'x'.repeat(400),
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'used-tool',
      messageId: 'a1',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'drop-me',
      messageId: 'u2',
    });
    store.appendEvent(session.id, {
      type: 'tool_result',
      toolCallId: 't-drop',
      toolName: 'read',
      content: 'y'.repeat(800),
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'later',
      messageId: 'a2',
    });

    await runtime.rewindSession(session.id, 'u2');

    const usage = runtime.getContextUsage(session.id);
    expect(usage).toBeTruthy();
    const summarized = usage!.buckets.find((b) => b.id === 'summarized');
    expect(summarized?.tokens ?? 0).toBeGreaterThan(0);
    // 截断后仍保留压缩边界与 u1 轮 tool；用量应低于含 t-drop 的状态，且 conversation 含 recent-tail
    expect(usage!.totalTokens).toBeGreaterThan(0);

    const resumed = await runtime.resumeSession(session.id);
    const resumeUsage = resumed.contextUsage ?? runtime.getContextUsage(session.id);
    expect(resumeUsage?.buckets.find((b) => b.id === 'summarized')?.tokens ?? 0).toBeGreaterThan(0);
    expect(resumeUsage?.totalTokens).toBe(usage!.totalTokens);

    await runtime.deleteSession(session.id);
  });

  it('prepareFork truncates then allows clean history', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-fork-'));
    const store = new SessionStore({ sessionsRoot: root });
    const runtime = new PiAgentRuntime(config, { sessionStore: store });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'old',
      messageId: 'u1',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'reply',
      messageId: 'a1',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'to-replace',
      messageId: 'u2',
    });
    const out = await runtime.prepareFork(session.id, 'u2');
    expect(out.messages.map((m) => m.content)).toEqual(['old', 'reply']);
    expect(store.eventLog!.readEvents(session.id).some((e) => e.type === 'fork')).toBe(true);
    await runtime.deleteSession(session.id);
  });

  it('forkChatSession clones through assistant; source unchanged', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-fork-chat-'));
    const store = new SessionStore({ sessionsRoot: root });
    const runtime = new PiAgentRuntime(config, { sessionStore: store });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    await runtime.setSessionTitle(session.id, 'Original');
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
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'a2',
      messageId: 'a2',
    });

    const srcCount = store.eventLog!.readEvents(session.id).length;
    const out = await runtime.forkChatSession(session.id, 'a1');
    expect(out.session.id).not.toBe(session.id);
    expect(out.session.title).toMatch(/^Fork ·/);
    expect(out.messages.map((m) => m.content)).toEqual(['q1', 'a1']);
    expect(store.eventLog!.readEvents(session.id).length).toBe(srcCount);
    const srcResume = await runtime.resumeSession(session.id);
    expect(srcResume.messages.map((m) => m.content)).toEqual(['q1', 'a1', 'q2', 'a2']);
    await runtime.deleteSession(out.session.id);
    await runtime.deleteSession(session.id);
  });

  it('rewind throws SESSION_BUSY while streaming flag set', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-busy-'));
    const runtime = new PiAgentRuntime(config, {
      sessionStore: new SessionStore({ sessionsRoot: root }),
    });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    (
      runtime as unknown as { busySessions: Set<string> }
    ).busySessions.add(session.id);
    await expect(runtime.rewindSession(session.id, 'u1')).rejects.toThrow(/SESSION_BUSY/);
    await runtime.deleteSession(session.id);
  });

  it('compactSession throws SESSION_BUSY while streaming without allowBusy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-compact-busy-'));
    const runtime = new PiAgentRuntime(config, {
      sessionStore: new SessionStore({ sessionsRoot: root }),
    });
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    (
      runtime as unknown as { busySessions: Set<string> }
    ).busySessions.add(session.id);
    await expect(runtime.compactSession(session.id, { method: 'micro' })).rejects.toThrow(
      /SESSION_BUSY/,
    );
    await runtime.deleteSession(session.id);
  });

  it('compact rebuild rebinds confirmed plan markdown', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-compact-plan-'));
    const runtime = new PiAgentRuntime(config, {
      sessionStore: new SessionStore({ sessionsRoot: root }),
    });
    const session = await runtime.createSession({ workspace, mode: 'plan' });
    const { PlanStore } = await import('@ciro-code/harness-core');
    const plan = new PlanStore({ sessionsRoot: root }).create(session.id, {
      title: 'Keep me',
      markdown: '## Steps\n- do thing\n',
      planId: 'abcd1234',
    });
    await runtime.confirmPlan(session.id, plan.planId);
    type Entry = {
      confirmedPlanMarkdown?: string;
      confirmedPlanId?: string;
    };
    const sessions = (runtime as unknown as { sessions: Map<string, Entry> }).sessions;
    const before = sessions.get(session.id);
    expect(before?.confirmedPlanMarkdown).toBeTruthy();
    if (before) {
      before.confirmedPlanMarkdown = undefined;
      before.confirmedPlanId = undefined;
    }
    await runtime.compactSession(session.id, { method: 'micro' });
    const after = sessions.get(session.id);
    expect(after?.confirmedPlanId).toBe('abcd1234');
    expect(after?.confirmedPlanMarkdown).toMatch(/Keep me|Steps|do thing/);
    await runtime.deleteSession(session.id);
  });
});
