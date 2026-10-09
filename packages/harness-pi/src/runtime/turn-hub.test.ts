import { describe, expect, it } from 'vitest';
import { createSessionActivityHub, createTurnHub } from './runtime-shared.js';
import { makeEnvelope } from '../sse/envelope.js';

describe('createTurnHub seq (O3)', () => {
  it('stamps monotonic seq 0,1,2… on push', async () => {
    const hub = createTurnHub();
    hub.push(makeEnvelope('token', { delta: 'a' }, 's1'));
    hub.push(makeEnvelope('token', { delta: 'b' }, 's1'));
    hub.push(makeEnvelope('complete', { messageId: 'm' }, 's1'));
    hub.finish();
    const events = [];
    for await (const e of hub.subscribe(0)) events.push(e);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(events[0]!.payload).toEqual({ delta: 'a' });
  });

  it('subscribe(fromIndex) skips already consumed seq', async () => {
    const hub = createTurnHub();
    hub.push(makeEnvelope('token', { delta: 'a' }, 's1'));
    hub.push(makeEnvelope('token', { delta: 'b' }, 's1'));
    hub.push(makeEnvelope('token', { delta: 'c' }, 's1'));
    hub.finish();
    const events = [];
    for await (const e of hub.subscribe(2)) events.push(e);
    expect(events.map((e) => (e.payload as { delta: string }).delta)).toEqual(['c']);
    expect(events[0]!.seq).toBe(2);
  });
});

describe('createSessionActivityHub (O3)', () => {
  it('delivers busy then idle to subscriber', async () => {
    const hub = createSessionActivityHub();
    const iter = hub.subscribe();
    const first = iter.next();
    hub.notifyBusy('sid-1');
    const busy = await first;
    expect(busy.value?.type).toBe('session_busy');
    expect((busy.value?.payload as { sessionId: string }).sessionId).toBe('sid-1');

    const second = iter.next();
    hub.notifyIdle('sid-1');
    const idle = await second;
    expect(idle.value?.type).toBe('session_idle');
    await iter.return?.(undefined);
  });
});
