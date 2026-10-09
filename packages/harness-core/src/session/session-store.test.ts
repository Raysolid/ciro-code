import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionStore } from './session-store.js';

describe('SessionStore persist', () => {
  it('writes events.jsonl and meta.json on create', () => {
    const root = mkdtempSync(join(tmpdir(), 'sess-jsonl-'));
    const store = new SessionStore({ sessionsRoot: root, snapshotInterval: 2 });
    const handle = store.create({ workspace: '/ws', mode: 'ask' });

    const dir = join(root, handle.id);
    expect(existsSync(join(dir, 'events.jsonl'))).toBe(true);
    expect(existsSync(join(dir, 'meta.json'))).toBe(true);

    const events = store.eventLog!.readEvents(handle.id);
    expect(events[0]?.type).toBe('session_start');

    store.appendEvent(handle.id, { type: 'message', role: 'user', content: 'hi' });
    store.updateMode(handle.id, 'agent');

    const all = store.eventLog!.readEvents(handle.id);
    expect(all.some((e) => e.type === 'message')).toBe(true);
    expect(all.some((e) => e.type === 'mode_change')).toBe(true);

    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf-8')) as {
      lastEventOffset: number;
      currentState: { mode: string; messageCount: number };
      snapshotPoints: number[];
    };
    expect(meta.currentState.mode).toBe('agent');
    expect(meta.currentState.messageCount).toBe(1);
    expect(meta.lastEventOffset).toBeGreaterThan(0);
    expect(meta.snapshotPoints.length).toBeGreaterThanOrEqual(1);
  });

  it('updateTitle persists to memory and meta', () => {
    const root = mkdtempSync(join(tmpdir(), 'sess-title-'));
    const store = new SessionStore({ sessionsRoot: root });
    const handle = store.create({ workspace: '/ws', mode: 'ask' });
    const updated = store.updateTitle(handle.id, '  Hello  ');
    expect(updated?.title).toBe('Hello');
    expect(store.get(handle.id)?.title).toBe('Hello');
    expect(store.eventLog!.readMeta(handle.id)?.currentState.title).toBe('Hello');
  });

  it('truncateBeforeUserMessage drops later turns', () => {
    const root = mkdtempSync(join(tmpdir(), 'sess-trunc-'));
    const store = new SessionStore({ sessionsRoot: root });
    const handle = store.create({ workspace: '/ws', mode: 'ask' });
    store.appendEvent(handle.id, {
      type: 'message',
      role: 'user',
      content: 'q1',
      messageId: 'u1',
    });
    store.appendEvent(handle.id, {
      type: 'message',
      role: 'assistant',
      content: 'a1',
      messageId: 'a1',
    });
    store.appendEvent(handle.id, {
      type: 'message',
      role: 'user',
      content: 'q2',
      messageId: 'u2',
    });
    store.truncateBeforeUserMessage(handle.id, 'u2');
    const events = store.eventLog!.readEvents(handle.id);
    expect(events.some((e) => e.messageId === 'u2')).toBe(false);
    expect(events.some((e) => e.messageId === 'u1')).toBe(true);
  });

  it('skips corrupt jsonl lines', () => {
    const root = mkdtempSync(join(tmpdir(), 'sess-corrupt-'));
    const store = new SessionStore({ sessionsRoot: root });
    const handle = store.create({ workspace: '/ws' });
    appendFileSync(join(root, handle.id, 'events.jsonl'), 'not-json\n', 'utf-8');
    store.appendEvent(handle.id, { type: 'message', role: 'user', content: 'ok' });
    const events = store.eventLog!.readEvents(handle.id);
    expect(events.every((e) => e.type)).toBe(true);
    expect(events.some((e) => e.type === 'message')).toBe(true);
  });
});
