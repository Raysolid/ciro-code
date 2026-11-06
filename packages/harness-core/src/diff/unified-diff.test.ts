import { describe, expect, it } from 'vitest';
import { buildUnifiedDiff } from './unified-diff.js';

function changeLines(text: string): string[] {
  return text.split('\n').filter((l) => {
    if (l.startsWith('+++') || l.startsWith('---')) return false;
    return l.startsWith('+') || l.startsWith('-');
  });
}

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

  it('normalizes CRLF so Windows before vs LF after is not a full-file rewrite', () => {
    const { text } = buildUnifiedDiff('win.txt', 'a\r\nb\r\n', 'a\nb\nc\n');
    expect(text).toContain('+c');
    expect(text).not.toContain('-a');
    expect(text).not.toContain('+a');
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

  it('shows deletions before additions within a change', () => {
    const { text } = buildUnifiedDiff('mid.ts', 'keep-a\nold\nkeep-b', 'keep-a\nnew\nkeep-b');
    expect(changeLines(text)).toEqual(['-old', '+new']);
  });

  it('keeps multi-line replacement as dels then adds', () => {
    const { text } = buildUnifiedDiff('a.ts', 'a\nold1\nold2\nb', 'a\nnew1\nnew2\nb');
    expect(changeLines(text)).toEqual(['-old1', '-old2', '+new1', '+new2']);
  });

  it('emits separate hunks for non-contiguous edits', () => {
    const before = Array.from({ length: 20 }, (_, i) => `L${i}`).join('\n');
    const after = Array.from({ length: 20 }, (_, i) => (i === 5 || i === 15 ? `X${i}` : `L${i}`)).join(
      '\n',
    );
    const { text } = buildUnifiedDiff('b.ts', before, after);
    const hunks = text.split('\n').filter((l) => l.startsWith('@@'));
    expect(hunks).toHaveLength(2);
    expect(changeLines(text)).toEqual(['-L5', '+X5', '-L15', '+X15']);
  });

  it('truncates oversized diffs', () => {
    const before = 'a\n'.repeat(10);
    const after = 'b\n'.repeat(10);
    const { text, truncated } = buildUnifiedDiff('big.txt', before, after, 80);
    expect(truncated).toBe(true);
    expect(text).toContain('(diff truncated)');
  });
});
