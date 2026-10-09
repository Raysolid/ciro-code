import { describe, expect, it } from 'vitest';
import { buildUnifiedDiff } from './unified-diff.js';

describe('buildUnifiedDiff', () => {
  it('returns empty for identical content', () => {
    expect(buildUnifiedDiff('a.ts', 'x', 'x').text).toBe('');
  });

  it('emits a hunk with only the added line', () => {
    const { text, truncated } = buildUnifiedDiff('foo.txt', 'hello\n', 'hello\nworld\n');
    expect(truncated).toBe(false);
    expect(text).toContain('--- a/foo.txt');
    expect(text).toContain('+++ b/foo.txt');
    expect(text).toContain('+world');
    expect(text).not.toContain('-hello');
  });

  it('emits only the changed middle line, not the whole file', () => {
    const before = ['keep-a', 'old', 'keep-b', 'keep-c'].join('\n');
    const after = ['keep-a', 'new', 'keep-b', 'keep-c'].join('\n');
    const { text } = buildUnifiedDiff('mid.ts', before, after);
    expect(text).toContain('-old');
    expect(text).toContain('+new');
    expect(text).not.toContain('-keep-c');
    expect(text).not.toContain('+keep-c');
  });

  it('truncates oversized diffs', () => {
    const before = 'a\n'.repeat(10);
    const after = 'b\n'.repeat(10);
    const { text, truncated } = buildUnifiedDiff('big.txt', before, after, 80);
    expect(truncated).toBe(true);
    expect(text).toContain('(diff truncated)');
  });
});
