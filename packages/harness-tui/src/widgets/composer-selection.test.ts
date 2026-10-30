import { describe, expect, it } from 'vitest';
import { stringWidth } from '../width/measure.js';
import { COMPOSER_PROMPT } from './composer.js';
import {
  buildComposerContentMap,
  inputRangeFromSelection,
  replaceInputRange,
} from './composer-selection.js';

describe('composer-selection', () => {
  it('maps selection to input range and deletes', () => {
    const input = 'ABCDEFGH';
    const width = 40;
    const cells = buildComposerContentMap(input, undefined, width, 8);
    expect(cells.length).toBeGreaterThan(0);

    const promptW = stringWidth(COMPOSER_PROMPT);
    const geom = { boxTopRow: 10, bodyRowCount: 1, width, promptW };
    // 选中 CDE：正文列 2..5 → 屏幕列 = 2 + promptW + contentCol
    const origin = 2 + promptW;
    const sel = {
      anchor: { row: 11, col: origin + 2 },
      focus: { row: 11, col: origin + 5 },
    };
    const range = inputRangeFromSelection(sel, geom, cells);
    expect(range).toEqual({ start: 2, end: 5 });
    expect(replaceInputRange(input, range!.start, range!.end)).toBe('ABFGH');
    expect(replaceInputRange(input, range!.start, range!.end, 'X')).toBe('ABXFGH');
  });

  it('returns null when selection is outside composer', () => {
    const cells = buildComposerContentMap('hi', undefined, 40, 8);
    const geom = { boxTopRow: 10, bodyRowCount: 1, width: 40, promptW: 2 };
    const range = inputRangeFromSelection(
      { anchor: { row: 0, col: 0 }, focus: { row: 1, col: 5 } },
      geom,
      cells,
    );
    expect(range).toBeNull();
  });
});
