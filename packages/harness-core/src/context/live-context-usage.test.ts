import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextAccountant } from './context-accountant.js';
import { createLiveContextUsageEmitter } from './live-context-usage.js';

describe('createLiveContextUsageEmitter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flush includes in-flight assistant without mutating stored conversation', () => {
    const context = new ContextAccountant({
      modelContextLimit: 10_000,
      reservedOutputTokens: 0,
    });
    context.appendConversation('s1', '\nUser: hi');
    const snaps: number[] = [];
    let assistant = '';

    const live = createLiveContextUsageEmitter({
      context,
      sessionId: 's1',
      minIntervalMs: 500,
      getStaticParts: () => ({ system: 'sys', toolPayloadTokens: 0 }),
      getInFlightAssistantText: () => assistant,
      onSnapshot: (snap) => {
        snaps.push(snap.buckets.find((b) => b.id === 'conversation')?.tokens ?? 0);
      },
    });

    assistant = 'hello world from assistant';
    live.flush();
    expect(snaps.length).toBe(1);
    expect(snaps[0]).toBeGreaterThan(0);
    expect(context.getConversation('s1')).toBe('\nUser: hi');
    live.dispose();
  });

  it('schedule throttles then trailing-emits', () => {
    vi.useFakeTimers();
    const context = new ContextAccountant({
      modelContextLimit: 10_000,
      reservedOutputTokens: 0,
    });
    context.appendConversation('s1', '\nUser: hi');
    const snaps: string[] = [];
    let assistant = 'a';

    const live = createLiveContextUsageEmitter({
      context,
      sessionId: 's1',
      minIntervalMs: 500,
      getStaticParts: () => ({ system: 'sys' }),
      getInFlightAssistantText: () => assistant,
      onSnapshot: (snap) => snaps.push(snap.updatedAt),
    });

    live.schedule();
    expect(snaps.length).toBe(1);
    assistant = 'ab';
    live.schedule();
    expect(snaps.length).toBe(1);
    assistant = 'abc';
    vi.advanceTimersByTime(500);
    expect(snaps.length).toBe(2);
    live.dispose();
  });

  it('flush folds toolPayloadTokens into conversation', () => {
    const context = new ContextAccountant({
      modelContextLimit: 10_000,
      reservedOutputTokens: 0,
    });
    context.appendConversation('s1', '\nUser: hi');
    let payload = 0;
    let lastConv = 0;

    const live = createLiveContextUsageEmitter({
      context,
      sessionId: 's1',
      getStaticParts: () => ({ toolPayloadTokens: payload }),
      getInFlightAssistantText: () => '',
      onSnapshot: (snap) => {
        lastConv = snap.buckets.find((b) => b.id === 'conversation')?.tokens ?? 0;
      },
    });

    live.flush();
    const base = lastConv;
    payload = 100;
    live.flush();
    expect(lastConv).toBe(base + 100);
    live.dispose();
  });
});
