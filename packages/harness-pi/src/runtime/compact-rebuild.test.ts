import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CompactionOrchestrator,
  ContextAccountant,
  SessionStore,
} from '@ciro-code/harness-core';
import {
  createHarnessConfig,
  createMinimalModeProfiles,
  DEFAULT_COMPACTION_CONFIG,
} from '@ciro-code/harness-shared';
import { compactSessionShared } from './runtime-shared.js';
import { MockAgentRuntime } from './mock-agent-runtime.js';

describe('compactSessionShared seed', () => {
  it('session-memory seed starts with summary and keeps UI events intact', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'compact-seed-ws-'));
    mkdirSync(join(workspace, '.ciro', 'memory'), { recursive: true });
    writeFileSync(
      join(workspace, '.ciro', 'memory', 'session-memory.md'),
      '# Session Memory\n\n- used Redis\n',
    );
    const sessionsRoot = mkdtempSync(join(tmpdir(), 'compact-seed-sess-'));
    const store = new SessionStore({ sessionsRoot });
    const session = store.create({ workspace, mode: 'ask' });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'early question about postgres',
      messageId: 'u1',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'early answer',
      messageId: 'a1',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'user',
      content: 'RECENT_USER',
      messageId: 'u2',
    });
    store.appendEvent(session.id, {
      type: 'message',
      role: 'assistant',
      content: 'RECENT_ASSISTANT',
      messageId: 'a2',
    });

    const context = new ContextAccountant({
      modelContextLimit: 8000,
      reservedOutputTokens: 500,
      compaction: DEFAULT_COMPACTION_CONFIG,
    });
    // 远超 SM keepRecentTokens(1500)≈6000 字符，确保 early 被裁掉
    const longEarly = 'EARLYWORD '.repeat(4000);
    const fullConv = `\nUser: ${longEarly}\nAssistant: old\nUser: RECENT_USER\nAssistant: RECENT_ASSISTANT`;
    context.setConversation(session.id, fullConv);
    context.setSummarized(session.id, '');

    const compaction = new CompactionOrchestrator(DEFAULT_COMPACTION_CONFIG, context);
    const toolResults = new Map();
    const beforeEvents = store.eventLog!.readEvents(session.id).length;

    const out = await compactSessionShared({
      store,
      context,
      compaction,
      toolResults,
      sessionDir: join(sessionsRoot, session.id),
      sessionId: session.id,
      modeProfiles: createMinimalModeProfiles(),
      compactOpts: { method: 'session-memory' },
    });

    expect(out.result.metadata.method).toBe('session-memory');
    expect(out.seedMessages[0]?.content).toContain('Session memory');
    expect(out.seedMessages.some((m) => m.content.includes('RECENT_USER'))).toBe(true);
    const seedText = out.seedMessages.map((m) => m.content).join('\n');
    expect(seedText.length).toBeLessThan(fullConv.length);
    const earlyInSeed = (seedText.match(/EARLYWORD/g) ?? []).length;
    const earlyInFull = (fullConv.match(/EARLYWORD/g) ?? []).length;
    expect(earlyInFull).toBeGreaterThan(3000);
    expect(earlyInSeed).toBeLessThan(earlyInFull / 2);
    // UI transcript 不截断（仅追加 compaction 事件）
    expect(store.eventLog!.readEvents(session.id).length).toBeGreaterThan(beforeEvents);
    const msgs = store.eventLog!.readEvents(session.id).filter((e) => e.type === 'message');
    expect(msgs.some((e) => e.content === 'early question about postgres')).toBe(true);
  });
});

describe('MockAgentRuntime compact busy', () => {
  it('rejects manual compact while busy; allowBusy works', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mock-compact-ws-'));
    const sessionsRoot = mkdtempSync(join(tmpdir(), 'mock-compact-sess-'));
    const runtime = new MockAgentRuntime(
      createHarnessConfig({
        workspace,
        mode: 'ask',
        agentBackend: 'mock',
        llm: { provider: 'env', model: 'mock' },
      }),
      { sessionStore: new SessionStore({ sessionsRoot }) },
    );
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    (runtime as unknown as { busySessions: Set<string> }).busySessions.add(session.id);
    await expect(runtime.compactSession(session.id, { method: 'micro' })).rejects.toThrow(
      /SESSION_BUSY/,
    );
    const ok = await runtime.compactSession(session.id, {
      method: 'micro',
      allowBusy: true,
    });
    expect(ok.result.metadata.method).toBe('micro');
    await runtime.deleteSession(session.id);
  });
});
