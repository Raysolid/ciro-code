import { describe, expect, it } from 'vitest';
import {
  padEndWidth,
  stringWidth,
  truncateMiddleToWidth,
  truncateToWidth,
  wrapToWidth,
} from './measure.js';

describe('stringWidth', () => {
  it('counts ASCII as 1', () => {
    expect(stringWidth('abc')).toBe(3);
  });

  it('counts CJK as 2', () => {
    expect(stringWidth('你好')).toBe(4);
    expect(stringWidth('a中b')).toBe(4);
  });

  it('counts fullwidth punct', () => {
    expect(stringWidth('（）')).toBe(4);
  });
});

describe('truncateToWidth', () => {
  it('truncates on width boundary', () => {
    expect(truncateToWidth('你好世界', 5)).toBe('你好…');
  });

  it('returns original when fits', () => {
    expect(truncateToWidth('hi', 10)).toBe('hi');
  });
});

describe('padEndWidth', () => {
  it('pads to target columns', () => {
    expect(padEndWidth('中', 4)).toBe('中  ');
  });
});

describe('truncateMiddleToWidth', () => {
  it('keeps head and tail for long paths', () => {
    const p = 'D:/workspace/ciro-chat/ciro/packages/harness-tui';
    const out = truncateMiddleToWidth(p, 24);
    expect(stringWidth(out)).toBeLessThanOrEqual(24);
    expect(out).toContain('…');
    expect(out.startsWith('D:/')).toBe(true);
    expect(out.endsWith('tui')).toBe(true);
  });
});

describe('wrapToWidth', () => {
  it('wraps ASCII on column boundary', () => {
    expect(wrapToWidth('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('wraps CJK by display width, never exceeding width', () => {
    const rows = wrapToWidth('你好世界测试', 5);
    expect(rows.every((r) => stringWidth(r) <= 5)).toBe(true);
    expect(rows.join('')).toBe('你好世界测试');
  });

  it('preserves explicit newlines', () => {
    expect(wrapToWidth('ab\ncd', 10)).toEqual(['ab', 'cd']);
  });
});


