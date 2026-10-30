import { describe, expect, it } from 'vitest';
import {
  backspaceInput,
  countPasteLines,
  expandPasteMarks,
  isMultilinePaste,
  makePasteMark,
  pasteChipLabel,
  splitInputPieces,
} from './paste-blocks.js';

describe('paste-blocks', () => {
  it('detects multiline paste', () => {
    expect(isMultilinePaste('a\nb')).toBe(true);
    expect(isMultilinePaste('single')).toBe(false);
    expect(countPasteLines('a\r\nb\nc')).toBe(3);
  });

  it('expands marks on submit', () => {
    const id = 1;
    const mark = makePasteMark(id);
    const input = `hi ${mark} bye`;
    const blocks = new Map([[id, 'L1\nL2\nL3']]);
    expect(expandPasteMarks(input, blocks)).toBe('hi L1\nL2\nL3 bye');
  });

  it('backspace deletes whole paste mark', () => {
    const mark = makePasteMark(2);
    expect(backspaceInput(`x${mark}`)).toBe('x');
    expect(backspaceInput('ab')).toBe('a');
  });

  it('splits pieces and chip label', () => {
    const mark = makePasteMark(1);
    expect(splitInputPieces(`a${mark}b`)).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'paste', id: 1 },
      { kind: 'text', text: 'b' },
    ]);
    expect(pasteChipLabel(4)).toBe('[Pasted 4 lines]');
  });
});
