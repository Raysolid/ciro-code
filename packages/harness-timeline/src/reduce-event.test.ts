import { describe, expect, it } from 'vitest';
import type { SseEnvelope } from '@ciro-code/harness-shared';

import type { ChatMessage } from './chat-message.js';
import { createStreamDeltaBatcher } from './stream-delta-batcher.js';
import { reduceEventForSession, type ReduceChatSlice } from './reduce-event.js';
import { testT } from './test-translate.js';

function envelope(type: string, payload: unknown): SseEnvelope {
  return { type, ts: Date.now(), payload } as SseEnvelope;
}

function slice(messages: ChatMessage[]): ReduceChatSlice {
  return { messages, permissions: [], contextUsage: null };
}

describe('reduceEventForSession', () => {
  it('keeps multiple permission_request in queue until each resolves', () => {
    const batcher = createStreamDeltaBatcher(() => undefined, {
      schedule: (cb) => {
        cb();
        return 1;
      },
      cancel: () => undefined,
    });
    const ctx = {
      batcher,
      isFocused: true,
      seqRefs: { lastSeq: null },
      t: testT,
    };
    let state = slice([]);
    state = reduceEventForSession(
      state,
      's1',
      envelope('permission_request', {
        permissionId: 'p1',
        toolName: 'bash',
        toolCallId: 'tc1',
        toolInput: { command: 'echo 1' },
      }),
      'a1',
      ctx,
    ).state;
    state = reduceEventForSession(
      state,
      's1',
      envelope('permission_request', {
        permissionId: 'p2',
        toolName: 'bash',
        toolCallId: 'tc2',
        toolInput: { command: 'echo 2' },
      }),
      'a1',
      ctx,
    ).state;
    expect(state.permissions).toHaveLength(2);
    expect(state.permissions?.map((p) => p.permissionId)).toEqual(['p1', 'p2']);

    state = reduceEventForSession(
      state,
      's1',
      envelope('permission_resolved', { permissionId: 'p1', decision: 'allow' }),
      'a1',
      ctx,
    ).state;
    expect(state.permissions).toHaveLength(1);
    expect(state.permissions?.[0]?.permissionId).toBe('p2');
  });

  it('sets compactionNotice on progress/completed without toast', () => {
    const batcher = createStreamDeltaBatcher(() => undefined, {
      schedule: (cb) => {
        cb();
        return 1;
      },
      cancel: () => undefined,
    });
    const state = slice([]);
    const ctx = {
      batcher,
      isFocused: true,
      seqRefs: { lastSeq: null },
      t: testT,
    };
    const progress = reduceEventForSession(
      state,
      's1',
      envelope('compaction_progress', { method: 'full', stage: 'start' }),
      'a1',
      ctx,
    );
    expect(progress.state.compactionNotice).toEqual({ status: 'running', method: 'full' });
    expect(progress.effects.some((e) => e.type === 'toast')).toBe(false);

    const done = reduceEventForSession(
      progress.state,
      's1',
      envelope('compaction_completed', {
        result: {
          narrative: 'saved',
          metadata: { method: 'full', tokensSaved: 120, removedMessageCount: 0, mode: 'agent' },
        },
      }),
      'a1',
      ctx,
    );
    // SM/full：写入时间线分隔条，不再用底部 done notice
    expect(done.state.compactionNotice).toBeNull();
    const marker = done.state.messages.find((m) => m.role === 'compaction');
    expect(marker?.compaction?.method).toBe('full');
    expect(marker?.compaction?.tokensSaved).toBe(120);
    expect(done.effects.some((e) => e.type === 'toast')).toBe(false);

    const microDone = reduceEventForSession(
      state,
      's1',
      envelope('compaction_completed', {
        result: { metadata: { method: 'micro', tokensSaved: 5 } },
      }),
      'a1',
      ctx,
    );
    expect(microDone.state.compactionNotice).toBeNull();
    expect(microDone.state.messages.some((m) => m.role === 'compaction')).toBe(false);
  });

  it('batches token deltas without mutating messages until flush', () => {
    const flushes: unknown[] = [];
    const batcher = createStreamDeltaBatcher((f) => flushes.push(f), {
      schedule: (cb) => {
        cb();
        return 1;
      },
      cancel: () => undefined,
    });
    const msgs: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: '', status: 'streaming', timeline: [] },
    ];
    const state = slice(msgs);
    const r1 = reduceEventForSession(state, 's1', envelope('token', { delta: 'hi' }), 'a1', {
      batcher,
      isFocused: true,
      seqRefs: { lastSeq: null },
      t: testT,
    });
    expect(r1.state.messages).toBe(msgs);
    expect(r1.action).toBe('continue');
  });

  it('applies tool_call_start into timeline', () => {
    const batcher = createStreamDeltaBatcher(() => undefined, {
      schedule: (cb) => {
        cb();
        return 1;
      },
      cancel: () => undefined,
    });
    const msgs: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: '', status: 'streaming', timeline: [] },
    ];
    const r = reduceEventForSession(
      slice(msgs),
      's1',
      envelope('tool_call_start', {
        toolCallId: 'tc1',
        toolName: 'read',
        toolInput: { path: 'a.ts' },
      }),
      'a1',
      {
        batcher,
        isFocused: true,
        seqRefs: { lastSeq: null },
        t: testT,
      },
    );
    const tools = r.state.messages[0]?.timeline?.filter((i) => i.kind === 'tool');
    expect(tools?.some((i) => i.kind === 'tool' && i.id === 'tc1')).toBe(true);
  });

  it('error returns break and setError effect when focused', () => {
    const batcher = createStreamDeltaBatcher(() => undefined, {
      schedule: () => 1,
      cancel: () => undefined,
    });
    const msgs: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: '', status: 'streaming', timeline: [] },
    ];
    const r = reduceEventForSession(
      slice(msgs),
      's1',
      envelope('error', { message: 'boom' }),
      'a1',
      {
        batcher,
        isFocused: true,
        seqRefs: { lastSeq: null },
        t: testT,
      },
    );
    expect(r.action).toBe('break');
    expect(r.effects.some((e) => e.type === 'setError' && e.message === 'boom')).toBe(true);
    expect(r.state.messages[0]?.status).toBe('error');
  });

  it('notes seq watermark', () => {
    const batcher = createStreamDeltaBatcher(() => undefined, {
      schedule: () => 1,
      cancel: () => undefined,
    });
    const seqRefs = { lastSeq: null as number | null };
    const env = { ...envelope('complete', {}), seq: 7 } as SseEnvelope;
    const msgs: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: 'x', status: 'streaming', timeline: [] },
    ];
    reduceEventForSession(slice(msgs), 's1', env, 'a1', {
      batcher,
      isFocused: false,
      seqRefs,
      t: testT,
    });
    expect(seqRefs.lastSeq).toBe(7);
  });

  it('mode_changed emits setMode when focused', () => {
    const batcher = createStreamDeltaBatcher(() => undefined, {
      schedule: () => 1,
      cancel: () => undefined,
    });
    const r = reduceEventForSession(
      slice([]),
      's1',
      envelope('mode_changed', { mode: 'agent' }),
      'a1',
      {
        batcher,
        isFocused: true,
        seqRefs: { lastSeq: null },
        t: testT,
      },
    );
    expect(r.state.mode).toBe('agent');
    expect(r.effects).toContainEqual({ type: 'setMode', mode: 'agent' });
  });
});

describe('reduceEvent side channel', () => {
  it('emits sideEvent for unknown focused events (debug_*)', () => {
    const batcher = createStreamDeltaBatcher(() => undefined, {
      schedule: () => 1,
      cancel: () => undefined,
    });
    const r = reduceEventForSession(
      slice([{ id: 'a1', role: 'assistant', content: '', status: 'streaming', timeline: [] }]),
      's1',
      envelope('debug_hypothesis', { x: 1 }),
      'a1',
      {
        batcher,
        isFocused: true,
        seqRefs: { lastSeq: null },
        t: testT,
      },
    );
    expect(r.effects).toContainEqual({
      type: 'sideEvent',
      eventType: 'debug_hypothesis',
      payload: { x: 1 },
    });
  });

  it('emits sideEvent for plan_updated when focused', () => {
    const batcher = createStreamDeltaBatcher(() => undefined, {
      schedule: () => 1,
      cancel: () => undefined,
    });
    const payload = {
      planId: 'p1',
      title: 'T',
      markdown: '# x',
      todos: [{ id: 't1', content: 'a', status: 'pending' }],
    };
    const r = reduceEventForSession(
      slice([{ id: 'a1', role: 'assistant', content: '', status: 'streaming', timeline: [] }]),
      's1',
      envelope('plan_updated', payload),
      'a1',
      {
        batcher,
        isFocused: true,
        seqRefs: { lastSeq: null },
        t: testT,
      },
    );
    expect(r.effects).toContainEqual({
      type: 'sideEvent',
      eventType: 'plan_updated',
      payload,
    });
  });
});
