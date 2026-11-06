import { describe, expect, it, vi } from 'vitest';
import {
  createStreamDeltaBatcher,
  type StreamDeltaFlush,
} from './stream-delta-batcher.js';

function manualScheduler() {
  let queued: (() => void) | null = null;
  let handle = 0;
  return {
    schedule(cb: () => void) {
      queued = cb;
      return ++handle;
    },
    cancel() {
      queued = null;
    },
    flush() {
      const cb = queued;
      queued = null;
      cb?.();
    },
    get pending() {
      return queued != null;
    },
  };
}

describe('createStreamDeltaBatcher', () => {
  it('merges multiple deltas into one flush per rAF', () => {
    const sched = manualScheduler();
    const flushes: StreamDeltaFlush[] = [];
    const batcher = createStreamDeltaBatcher((f) => flushes.push(f), {
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    batcher.enqueue('s1', 'a1', 'token', 'Hel');
    batcher.enqueue('s1', 'a1', 'token', 'lo');
    batcher.enqueue('s1', 'a1', 'token', '!');
    expect(flushes).toHaveLength(0);
    expect(sched.pending).toBe(true);

    sched.flush();
    expect(flushes).toEqual([
      {
        sessionId: 's1',
        assistantId: 'a1',
        parts: [{ kind: 'token', text: 'Hello!' }],
      },
    ]);
  });

  it('keeps thinking→token order as separate parts', () => {
    const sched = manualScheduler();
    const flushes: StreamDeltaFlush[] = [];
    const batcher = createStreamDeltaBatcher((f) => flushes.push(f), {
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    batcher.enqueue('s1', 'a1', 'thinking', 'plan');
    batcher.enqueue('s1', 'a1', 'thinking', '…');
    batcher.enqueue('s1', 'a1', 'token', 'Hi');
    sched.flush();

    expect(flushes[0]?.parts).toEqual([
      { kind: 'thinking', text: 'plan…' },
      { kind: 'token', text: 'Hi' },
    ]);
  });

  it('flushSession forces apply before terminal events (no wait for rAF)', () => {
    const sched = manualScheduler();
    const flushes: StreamDeltaFlush[] = [];
    const batcher = createStreamDeltaBatcher((f) => flushes.push(f), {
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    batcher.enqueue('s1', 'a1', 'token', 'partial');
    expect(flushes).toHaveLength(0);

    batcher.flushSession('s1');
    expect(flushes).toEqual([
      {
        sessionId: 's1',
        assistantId: 'a1',
        parts: [{ kind: 'token', text: 'partial' }],
      },
    ]);
    expect(sched.pending).toBe(false);

    // terminal 路径：再入队也不应与已 flush 的混在一起
    batcher.enqueue('s1', 'a1', 'token', 'more');
    batcher.flushSession('s1');
    expect(flushes).toHaveLength(2);
    expect(flushes[1]?.parts[0]?.text).toBe('more');
  });

  it('discardSession drops buffer without flush (turnEpoch / abort)', () => {
    const sched = manualScheduler();
    const onFlush = vi.fn();
    const batcher = createStreamDeltaBatcher(onFlush, {
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    batcher.enqueue('s1', 'a1', 'token', 'gone');
    batcher.discardSession('s1');
    sched.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('isolates sessions: flush A does not emit B', () => {
    const sched = manualScheduler();
    const flushes: StreamDeltaFlush[] = [];
    const batcher = createStreamDeltaBatcher((f) => flushes.push(f), {
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    batcher.enqueue('A', 'a1', 'token', 'aaa');
    batcher.enqueue('B', 'b1', 'token', 'bbb');
    batcher.flushSession('A');
    expect(flushes).toHaveLength(1);
    expect(flushes[0]?.sessionId).toBe('A');
    expect(sched.pending).toBe(true);

    sched.flush();
    expect(flushes).toHaveLength(2);
    expect(flushes[1]?.sessionId).toBe('B');
  });
});
