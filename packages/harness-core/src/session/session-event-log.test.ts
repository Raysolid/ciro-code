import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionEventLog } from './session-event-log.js';
import { uiMessagesFromEvents } from './session-recovery.js';

describe('SessionEventLog.truncateBeforeUserMessage', () => {
  it('hard-truncates before target user message and recomputes meta', () => {
    const root = mkdtempSync(join(tmpdir(), 'evt-trunc-'));
    const log = new SessionEventLog({ sessionsRoot: root, snapshotInterval: 100 });
    const id = 's1';
    log.ensureSession(id, '/ws', 'ask', Date.now());
    log.append(id, { type: 'message', role: 'user', content: 'q1', messageId: 'u1' });
    log.append(id, { type: 'message', role: 'assistant', content: 'a1', messageId: 'a1' });
    log.append(id, { type: 'message', role: 'user', content: 'q2', messageId: 'u2' });
    log.append(id, { type: 'message', role: 'assistant', content: 'a2', messageId: 'a2' });

    const result = log.truncateBeforeUserMessage(id, 'u2');
    expect(result.discarded).toBe(2);
    expect(result.kept).toBeGreaterThanOrEqual(3);

    const events = log.readEvents(id);
    const msgs = uiMessagesFromEvents(events);
    expect(msgs.map((m) => m.content)).toEqual(['q1', 'a1']);
    expect(msgs.some((m) => m.id === 'u2')).toBe(false);

    const meta = log.readMeta(id)!;
    expect(meta.currentState.messageCount).toBe(2);
    expect(meta.lastEventOffset).toBeGreaterThan(0);
  });

  it('throws when messageId missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'evt-miss-'));
    const log = new SessionEventLog({ sessionsRoot: root });
    const id = 's2';
    log.ensureSession(id, '/ws', 'ask', Date.now());
    log.append(id, { type: 'message', role: 'user', content: 'hi', messageId: 'u1' });
    expect(() => log.truncateBeforeUserMessage(id, 'nope')).toThrow(/not found/);
  });
});

describe('SessionEventLog.updateTitle', () => {
  it('persists title on meta', () => {
    const root = mkdtempSync(join(tmpdir(), 'evt-title-'));
    const log = new SessionEventLog({ sessionsRoot: root });
    const id = 's3';
    log.ensureSession(id, '/ws', 'ask', Date.now());
    log.updateTitle(id, 'My chat');
    expect(log.readMeta(id)?.currentState.title).toBe('My chat');
    log.updateTitle(id, undefined);
    expect(log.readMeta(id)?.currentState.title).toBeUndefined();
  });
});

describe('SessionEventLog.cloneThroughMessage', () => {
  it('clones through assistant message; source unchanged', () => {
    const root = mkdtempSync(join(tmpdir(), 'evt-clone-'));
    const log = new SessionEventLog({ sessionsRoot: root, snapshotInterval: 100 });
    const src = 'src';
    const dest = 'dest';
    log.ensureSession(src, '/ws', 'ask', Date.now());
    log.append(src, { type: 'message', role: 'user', content: 'q1', messageId: 'u1' });
    log.append(src, { type: 'message', role: 'assistant', content: 'a1', messageId: 'a1' });
    log.append(src, { type: 'message', role: 'user', content: 'q2', messageId: 'u2' });
    log.append(src, { type: 'message', role: 'assistant', content: 'a2', messageId: 'a2' });
    const srcBefore = log.readEvents(src);

    log.ensureSession(dest, '/ws', 'ask', Date.now());
    const result = log.cloneThroughMessage(src, dest, 'a1');
    expect(result.cloned).toBeGreaterThanOrEqual(3);

    expect(log.readEvents(src)).toEqual(srcBefore);

    const destMsgs = uiMessagesFromEvents(log.readEvents(dest));
    expect(destMsgs.map((m) => m.content)).toEqual(['q1', 'a1']);
    expect(destMsgs.some((m) => m.id === 'u2')).toBe(false);

    const destMeta = log.readMeta(dest)!;
    expect(destMeta.sessionId).toBe(dest);
    expect(destMeta.currentState.messageCount).toBe(2);
  });

  it('throws when throughMessageId missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'evt-clone-miss-'));
    const log = new SessionEventLog({ sessionsRoot: root });
    log.ensureSession('src', '/ws', 'ask', Date.now());
    log.append('src', { type: 'message', role: 'user', content: 'hi', messageId: 'u1' });
    log.ensureSession('dest', '/ws', 'ask', Date.now());
    expect(() => log.cloneThroughMessage('src', 'dest', 'nope')).toThrow(/not found/);
  });
});

describe('SessionEventLog debug pointer', () => {
  it('writes currentState.debug from mode_change and keeps it after leaving debug', () => {
    const root = mkdtempSync(join(tmpdir(), 'evt-debug-'));
    const log = new SessionEventLog({ sessionsRoot: root });
    const id = 's-debug';
    log.ensureSession(id, '/ws', 'ask', Date.now());
    log.append(id, {
      type: 'mode_change',
      mode: 'debug',
      debugSessionId: 'abc123',
      logPathRel: '.ciro/debug/debug-abc123.log',
    });
    expect(log.readMeta(id)?.currentState.debug).toEqual({
      debugSessionId: 'abc123',
      logPathRel: '.ciro/debug/debug-abc123.log',
      status: 'ready',
    });
    log.append(id, { type: 'mode_change', mode: 'agent', previousMode: 'debug' });
    expect(log.readMeta(id)?.currentState.mode).toBe('agent');
    expect(log.readMeta(id)?.currentState.debug?.debugSessionId).toBe('abc123');
  });

  it('lastDebugPointer reads mode_change when meta.debug is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'evt-debug-replay-'));
    const log = new SessionEventLog({ sessionsRoot: root });
    const id = 's-legacy';
    log.ensureSession(id, '/ws', 'ask', Date.now());
    log.append(id, {
      type: 'mode_change',
      mode: 'debug',
      debugSessionId: 'legacy1',
      logPathRel: '.ciro/debug/debug-legacy1.log',
    });
    const meta = log.readMeta(id)!;
    delete meta.currentState.debug;
    writeFileSync(log.metaPath(id), JSON.stringify(meta, null, 2), 'utf-8');
    expect(log.readMeta(id)?.currentState.debug).toBeUndefined();
    expect(log.lastDebugPointer(id)?.debugSessionId).toBe('legacy1');
  });

  it('lastDebugPointer prefers meta.debug over events replay', () => {
    const root = mkdtempSync(join(tmpdir(), 'evt-debug-pref-'));
    const log = new SessionEventLog({ sessionsRoot: root });
    const id = 's-pref';
    log.ensureSession(id, '/ws', 'ask', Date.now());
    log.append(id, {
      type: 'mode_change',
      mode: 'debug',
      debugSessionId: 'from-event',
      logPathRel: '.ciro/debug/debug-from-event.log',
    });
    const meta = log.readMeta(id)!;
    meta.currentState.debug = {
      debugSessionId: 'from-meta',
      logPathRel: '.ciro/debug/debug-from-meta.log',
      status: 'ready',
    };
    writeFileSync(log.metaPath(id), JSON.stringify(meta, null, 2), 'utf-8');
    expect(log.lastDebugPointer(id)?.debugSessionId).toBe('from-meta');
  });
});
