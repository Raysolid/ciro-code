import { describe, it, expect } from 'vitest';
import { mkdtempSync, appendFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionEventLog } from './session-event-log.js';
import { SessionStore } from './session-store.js';
import {
  SessionRecoveryManager,
  parseEventLine,
  replayEvents,
  uiMessagesFromEvents,
} from './session-recovery.js';

describe('parseEventLine', () => {
  it('stops on corrupt json', () => {
    expect(parseEventLine('not-json').stop).toBe(true);
  });

  it('stops on critical message without user content', () => {
    const line = JSON.stringify({ type: 'message', ts: 1, role: 'user' });
    expect(parseEventLine(line).stop).toBe(true);
  });

  it('accepts valid user message', () => {
    const line = JSON.stringify({
      type: 'message',
      ts: 1,
      role: 'user',
      content: 'hi',
    });
    expect(parseEventLine(line).event?.type).toBe('message');
  });
});

describe('SessionRecoveryManager', () => {
  it('replays messages and restores mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'recover-'));
    const store = new SessionStore({ sessionsRoot: root });
    const handle = store.create({ workspace: '/ws', mode: 'ask' });
    store.appendEvent(handle.id, {
      type: 'message',
      role: 'user',
      content: 'hello world',
    });
    store.appendEvent(handle.id, {
      type: 'message',
      role: 'assistant',
      content: 'hi there',
    });
    store.updateMode(handle.id, 'agent');

    store.delete(handle.id);
    expect(store.get(handle.id)).toBeUndefined();

    const recovery = new SessionRecoveryManager(store.eventLog!);
    const state = recovery.recover(handle.id)!;
    expect(state.handle.mode).toBe('agent');
    expect(state.handle.workspace).toBe('/ws');
    expect(state.conversationText).toContain('User: hello world');
    expect(state.conversationText).toContain('Assistant: hi there');
    expect(state.messageCount).toBe(2);
    expect(state.stoppedAtBoundary).toBe(false);
    expect(state.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello world' }),
      expect.objectContaining({ role: 'assistant', content: 'hi there' }),
    ]);

    store.adopt(state.handle);
    expect(store.get(handle.id)?.mode).toBe('agent');
  });
});

describe('uiMessagesFromEvents', () => {
  it('maps user/assistant and skips empty content', () => {
    const msgs = uiMessagesFromEvents([
      { type: 'session_start', ts: 1, workspace: '/w', mode: 'ask' },
      { type: 'message', ts: 2, role: 'user', content: 'hi', messageId: 'u1' },
      { type: 'message', ts: 3, role: 'assistant', content: 'hello', messageId: 'a1' },
      { type: 'message', ts: 4, role: 'assistant', content: '' },
    ]);
    expect(msgs).toEqual([
      { id: 'u1', role: 'user', content: 'hi' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'hello',
        timeline: [{ kind: 'text', id: 'text-a1-3', text: 'hello' }],
      },
    ]);
  });

  it('restores user image attachment refs', () => {
    const msgs = uiMessagesFromEvents([
      {
        type: 'message',
        ts: 1,
        role: 'user',
        content: 'see',
        messageId: 'u1',
        images: [{ path: 'attachments/u1/0.png', mimeType: 'image/png' }],
      },
    ]);
    expect(msgs[0]).toEqual({
      id: 'u1',
      role: 'user',
      content: 'see',
      images: [{ path: 'attachments/u1/0.png', mimeType: 'image/png' }],
    });
  });

  it('attaches tool and file_edit timeline to following assistant', () => {
    const msgs = uiMessagesFromEvents([
      { type: 'message', ts: 1, role: 'user', content: 'read x', messageId: 'u1' },
      { type: 'tool_call', ts: 2, toolCallId: 't1', toolName: 'read', toolInput: { path: 'a.ts' } },
      { type: 'tool_result', ts: 3, toolCallId: 't1', toolName: 'read', content: 'ok' },
      {
        type: 'file_edit',
        ts: 4,
        path: 'a.ts',
        operation: 'write',
        summary: 'wrote',
        unifiedDiff: '+hi\n',
        toolCallId: 't2',
      },
      { type: 'message', ts: 5, role: 'assistant', content: 'done', messageId: 'a1' },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.content).toBe('done');
    expect(msgs[1]?.timeline).toEqual([
      expect.objectContaining({ kind: 'tool', id: 't1', toolName: 'read', status: 'done', preview: 'ok' }),
      expect.objectContaining({ kind: 'diff', path: 'a.ts', operation: 'write' }),
      expect.objectContaining({ kind: 'text', text: 'done' }),
    ]);
  });

  it('merges same messageId segments interleaved with tools', () => {
    const msgs = uiMessagesFromEvents([
      { type: 'message', ts: 1, role: 'user', content: 'go', messageId: 'u1' },
      { type: 'message', ts: 2, role: 'assistant', content: 'part1', messageId: 'a1' },
      { type: 'tool_call', ts: 3, toolCallId: 't1', toolName: 'read', toolInput: { path: 'a.ts' } },
      { type: 'tool_result', ts: 4, toolCallId: 't1', toolName: 'read', content: 'ok' },
      { type: 'message', ts: 5, role: 'assistant', content: 'part2', messageId: 'a1' },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.id).toBe('a1');
    expect(msgs[1]?.content).toBe('part1part2');
    expect(msgs[1]?.timeline?.map((i) => i.kind)).toEqual(['text', 'tool', 'text']);
  });

  it('nests steer/followUp user into open assistant timeline', () => {
    const msgs = uiMessagesFromEvents([
      { type: 'message', ts: 1, role: 'user', content: 'go', messageId: 'u1' },
      { type: 'message', ts: 2, role: 'assistant', content: 'part1', messageId: 'a1' },
      { type: 'tool_call', ts: 3, toolCallId: 't1', toolName: 'read', toolInput: { path: 'a.ts' } },
      {
        type: 'message',
        ts: 4,
        role: 'user',
        content: 'go left',
        messageId: 'steer-1',
        deliverAs: 'steer',
      },
      { type: 'tool_result', ts: 5, toolCallId: 't1', toolName: 'read', content: 'ok' },
      { type: 'message', ts: 6, role: 'assistant', content: 'part2', messageId: 'a1' },
      { type: 'turn_complete', ts: 7, messageId: 'a1', workedMs: 1000 },
      { type: 'message', ts: 8, role: 'user', content: 'next turn', messageId: 'u2' },
    ]);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1]?.timeline?.map((i) => i.kind)).toEqual([
      'text',
      'tool',
      'user',
      'text',
    ]);
    expect(msgs[1]?.timeline?.find((i) => i.kind === 'user')).toMatchObject({
      id: 'steer-1',
      text: 'go left',
    });
    expect(msgs[2]?.content).toBe('next turn');
  });

  it('nests followUp deliverAs the same way', () => {
    const msgs = uiMessagesFromEvents([
      { type: 'message', ts: 1, role: 'user', content: 'go', messageId: 'u1' },
      { type: 'message', ts: 2, role: 'assistant', content: 'part1', messageId: 'a1' },
      {
        type: 'message',
        ts: 3,
        role: 'user',
        content: 'and then',
        messageId: 'fu-1',
        deliverAs: 'followUp',
      },
      { type: 'message', ts: 4, role: 'assistant', content: 'done', messageId: 'a1' },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.timeline?.some((i) => i.kind === 'user' && i.id === 'fu-1')).toBe(true);
  });

  it('reconstructs thought and workedMs from thinking + turn_complete', () => {
    const msgs = uiMessagesFromEvents([
      { type: 'message', ts: 1, role: 'user', content: 'go', messageId: 'u1' },
      {
        type: 'thinking',
        ts: 2,
        messageId: 'a1',
        content: 'plan next',
        durationSec: 3,
      },
      { type: 'tool_call', ts: 3, toolCallId: 't1', toolName: 'read', toolInput: { path: 'a.ts' } },
      { type: 'tool_result', ts: 4, toolCallId: 't1', toolName: 'read', content: 'ok' },
      { type: 'message', ts: 5, role: 'assistant', content: 'done', messageId: 'a1' },
      { type: 'turn_complete', ts: 6, messageId: 'a1', workedMs: 42000 },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.workedMs).toBe(42000);
    expect(msgs[1]?.timeline?.map((i) => i.kind)).toEqual(['thought', 'tool', 'text']);
    expect(msgs[1]?.timeline?.[0]).toMatchObject({
      kind: 'thought',
      text: 'plan next',
      durationSec: 3,
    });
  });
});

describe('SessionRecoveryManager boundary', () => {
  it('stops at consistent boundary before corrupt critical line', () => {
    const root = mkdtempSync(join(tmpdir(), 'recover-stop-'));
    const log = new SessionEventLog({ sessionsRoot: root });
    log.ensureSession('s1', '/ws', 'ask', Date.now());
    log.append('s1', { type: 'message', role: 'user', content: 'keep-me' });
    appendFileSync(log.eventsPath('s1'), '{bad\n', 'utf-8');
    log.append('s1', { type: 'message', role: 'user', content: 'after-corrupt' });

    // append after corrupt still writes to file; recovery must stop at corrupt
    const recovery = new SessionRecoveryManager(log);
    const state = recovery.recover('s1')!;
    expect(state.stoppedAtBoundary).toBe(true);
    expect(state.conversationText).toContain('keep-me');
    expect(state.conversationText).not.toContain('after-corrupt');
  });

  it('replays compaction conversation override', () => {
    const events = [
      { type: 'session_start' as const, ts: 1, workspace: '/w', mode: 'ask' },
      { type: 'message' as const, ts: 2, role: 'user', content: 'old' },
      {
        type: 'compaction' as const,
        ts: 3,
        conversation: '\nUser: kept',
        summarized: 'note',
      },
    ];
    const r = replayEvents(events);
    expect(r.conversationText).toBe('\nUser: kept');
    expect(r.summarizedText).toBe('note');
  });

  it('uiMessagesFromEvents inserts SM/full compaction markers but skips micro', () => {
    const msgs = uiMessagesFromEvents([
      { type: 'message', ts: 1, role: 'user', content: 'a', messageId: 'u1' },
      { type: 'message', ts: 2, role: 'assistant', content: 'b', messageId: 'a1' },
      {
        type: 'compaction',
        ts: 3,
        method: 'micro',
        tokensSaved: 10,
      },
      {
        type: 'compaction',
        ts: 4,
        method: 'session-memory',
        tokensSaved: 100,
        narrative: 'kept recent',
      },
      { type: 'message', ts: 5, role: 'user', content: 'c', messageId: 'u2' },
    ]);
    const markers = msgs.filter((m) => m.role === 'compaction');
    expect(markers).toHaveLength(1);
    expect(markers[0]?.compaction?.method).toBe('session-memory');
    expect(markers[0]?.compaction?.tokensSaved).toBe(100);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'compaction', 'user']);
  });

  it('recovers tool-results from disk when tool_result event exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'recover-tr-'));
    const store = new SessionStore({ sessionsRoot: root });
    const handle = store.create({ workspace: '/ws' });
    const trDir = join(root, handle.id, 'tool-results');
    mkdirSync(trDir, { recursive: true });
    writeFileSync(
      join(trDir, 't1.json'),
      JSON.stringify({
        toolCallId: 't1',
        toolName: 'read',
        content: 'file body',
        storedAt: new Date().toISOString(),
        tokenCount: 2,
        retention: 'inline',
      }),
      'utf-8',
    );
    store.appendEvent(handle.id, {
      type: 'tool_result',
      toolCallId: 't1',
      toolName: 'read',
    });
    const state = new SessionRecoveryManager(store.eventLog!).recover(handle.id)!;
    expect(state.toolResults.some((t) => t.toolCallId === 't1')).toBe(true);
    expect(state.toolResults.find((t) => t.toolCallId === 't1')?.content).toBe('file body');
  });

  it('clears accounting toolResults after session-memory / full compaction', () => {
    const root = mkdtempSync(join(tmpdir(), 'recover-tr-clear-'));
    const store = new SessionStore({ sessionsRoot: root });
    const handle = store.create({ workspace: '/ws' });
    const trDir = join(root, handle.id, 'tool-results');
    mkdirSync(trDir, { recursive: true });
    writeFileSync(
      join(trDir, 'old.json'),
      JSON.stringify({
        toolCallId: 'old',
        toolName: 'read',
        content: 'x'.repeat(40_000),
        storedAt: new Date().toISOString(),
        tokenCount: 10_000,
        retention: 'inline',
      }),
      'utf-8',
    );
    store.appendEvent(handle.id, {
      type: 'tool_result',
      toolCallId: 'old',
      toolName: 'read',
    });
    store.appendEvent(handle.id, {
      type: 'compaction',
      method: 'session-memory',
      conversation: '\nUser: kept',
      summarized: 'summary',
    });
    store.appendEvent(handle.id, {
      type: 'tool_result',
      toolCallId: 'new',
      toolName: 'grep',
      content: 'hit',
    });
    const state = new SessionRecoveryManager(store.eventLog!).recover(handle.id)!;
    expect(state.toolResults.some((t) => t.toolCallId === 'old')).toBe(false);
    expect(state.toolResults.some((t) => t.toolCallId === 'new')).toBe(true);
    expect(state.conversationText).toBe('\nUser: kept');
    expect(state.summarizedText).toBe('summary');
  });

  it('purgeEmpty removes zero-message sessions only', () => {
    const root = mkdtempSync(join(tmpdir(), 'purge-empty-'));
    const store = new SessionStore({ sessionsRoot: root });
    const empty = store.create({ workspace: '/ws' });
    const used = store.create({ workspace: '/ws' });
    store.appendEvent(used.id, { type: 'message', role: 'user', content: 'hi' });

    const removed = new SessionRecoveryManager(store.eventLog!).purgeEmpty();
    expect(removed).toContain(empty.id);
    expect(removed).not.toContain(used.id);
    expect(existsSync(join(root, empty.id))).toBe(false);
    expect(existsSync(join(root, used.id))).toBe(true);
  });
});
