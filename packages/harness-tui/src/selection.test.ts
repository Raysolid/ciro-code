import { describe, expect, it } from 'vitest';
import {
  applySelectionHighlight,
  extractSelectionText,
  sliceByCols,
} from './selection.js';

describe('sliceByCols / extractSelectionText', () => {
  it('slices by display columns', () => {
    expect(sliceByCols('abcdef', 1, 4)).toBe('bcd');
  });

  it('extracts multi-line selection', () => {
    const text = extractSelectionText(['hello', 'world'], {
      anchor: { row: 0, col: 1 },
      focus: { row: 1, col: 3 },
    });
    expect(text).toBe('ello\nwor');
  });
});

describe('applySelectionHighlight', () => {
  it('marks selected range with inverse', () => {
    const lines = [[{ text: 'abcdef', fg: 'text' as const }]];
    const out = applySelectionHighlight(lines, {
      anchor: { row: 0, col: 2 },
      focus: { row: 0, col: 5 },
    });
    const inv = out[0]!.filter((s) => s.inverse).map((s) => s.text).join('');
    expect(inv).toBe('cde');
  });
});
