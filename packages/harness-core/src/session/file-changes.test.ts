import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '@ciro-code/harness-shared';
import { collectFileChanges } from './file-changes.js';

describe('collectFileChanges', () => {
  it('keeps latest edit per path', () => {
    const events: SessionEvent[] = [
      {
        type: 'file_edit',
        ts: 1,
        path: 'a.ts',
        operation: 'write',
        summary: 'first',
        unifiedDiff: 'd1',
      },
      {
        type: 'file_edit',
        ts: 2,
        path: 'b.ts',
        operation: 'edit',
        summary: 'b',
        unifiedDiff: 'd2',
      },
      {
        type: 'file_edit',
        ts: 3,
        path: 'a.ts',
        operation: 'edit',
        summary: 'second',
        unifiedDiff: 'd3',
      },
      { type: 'message', ts: 4, role: 'user', content: 'hi' },
    ];
    const list = collectFileChanges(events);
    expect(list).toHaveLength(2);
    expect(list[0]!.path).toBe('a.ts');
    expect(list[0]!.summary).toBe('second');
    expect(list[0]!.unifiedDiff).toBe('d3');
    expect(list[1]!.path).toBe('b.ts');
  });

  it('merges disposition from reviews', () => {
    const events: SessionEvent[] = [
      {
        type: 'file_edit',
        ts: 1,
        path: 'a.ts',
        operation: 'edit',
        summary: 'x',
        unifiedDiff: 'd',
      },
    ];
    const reviews = new Map([
      ['a.ts', { disposition: 'accepted' as const, reviewable: true }],
    ]);
    const list = collectFileChanges(events, reviews);
    expect(list[0]!.disposition).toBe('accepted');
    expect(list[0]!.reviewable).toBe(true);
  });

  it('marks legacy paths as not reviewable', () => {
    const events: SessionEvent[] = [
      {
        type: 'file_edit',
        ts: 1,
        path: 'legacy.ts',
        operation: 'write',
        summary: 'x',
        unifiedDiff: 'd',
      },
    ];
    const list = collectFileChanges(events, new Map());
    expect(list[0]!.disposition).toBe('pending');
    expect(list[0]!.reviewable).toBe(false);
  });
});
