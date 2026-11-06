import { describe, expect, it } from 'vitest';
import { noteEventSeq } from './seq-watermark.js';

describe('noteEventSeq', () => {
  it('sets and advances watermark', () => {
    const refs = { lastSeq: null as number | null };
    noteEventSeq(refs, { seq: 3 });
    expect(refs.lastSeq).toBe(3);
    noteEventSeq(refs, { seq: 2 });
    expect(refs.lastSeq).toBe(3);
    noteEventSeq(refs, { seq: 5 });
    expect(refs.lastSeq).toBe(5);
  });

  it('ignores non-finite seq', () => {
    const refs = { lastSeq: 1 as number | null };
    noteEventSeq(refs, {});
    noteEventSeq(refs, { seq: Number.NaN });
    expect(refs.lastSeq).toBe(1);
  });
});
