import { describe, expect, it } from 'vitest';
import type { HarnessSseEventType } from '@ciro-code/harness-shared';
import { ALL_SSE_EVENT_TYPES, assertAllEventsHandled } from './event-coverage.js';

describe('SSE event coverage guard', () => {
  it('lists all HarnessSseEventType values (no dupes)', () => {
    // 与 shared 联合类型保持同步；数量随协议增补
    expect(ALL_SSE_EVENT_TYPES.length).toBeGreaterThanOrEqual(36);
    const unique = new Set(ALL_SSE_EVENT_TYPES);
    expect(unique.size).toBe(ALL_SSE_EVENT_TYPES.length);
  });

  it('reduceEvent accepts every event type without throw', () => {
    expect(() => assertAllEventsHandled()).not.toThrow();
  });

  it('matches shared union exhaustively (compile-time sample)', () => {
    const sample: HarnessSseEventType = ALL_SSE_EVENT_TYPES[0]!;
    expect(sample).toBe('token');
  });
});
