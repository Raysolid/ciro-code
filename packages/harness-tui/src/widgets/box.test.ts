import { describe, expect, it } from 'vitest';
import { stringWidth } from '../width/measure.js';
import { boxBottomWithRight, boxTop } from './box.js';

describe('boxBottomWithRight', () => {
  it('always closes and matches exact display width', () => {
    for (const width of [40, 80, 120]) {
      const line = boxBottomWithRight(
        width,
        [
          { text: 'ask', fg: 'modeAsk', bold: true },
          { text: ' · ', fg: 'textMuted' },
          { text: 'default', fg: 'textMuted' },
        ],
        { fg: 'modeAsk', corner: 'round' },
      );
      const plain = line.map((s) => s.text).join('');
      expect(plain.startsWith('╰')).toBe(true);
      expect(plain.endsWith('╯')).toBe(true);
      expect(stringWidth(plain)).toBe(width);
    }
  });
});

describe('boxTop', () => {
  it('closes both corners at exact width', () => {
    const line = boxTop(60, { fg: 'modeAsk', corner: 'round' });
    const plain = line.map((s) => s.text).join('');
    expect(plain.startsWith('╭')).toBe(true);
    expect(plain.endsWith('╮')).toBe(true);
    expect(stringWidth(plain)).toBe(60);
  });
});
