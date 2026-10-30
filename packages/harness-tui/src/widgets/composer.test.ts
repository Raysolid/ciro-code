import { describe, expect, it } from 'vitest';
import { makePasteMark } from '../paste-blocks.js';
import { linesToPlain } from '../tui-kit/ansi.js';
import { stringWidth } from '../width/measure.js';
import { buildComposerBox, COMPOSER_PROMPT, layoutComposerRows } from './composer.js';

describe('layoutComposerRows', () => {
  it('keeps explicit newlines', () => {
    const rows = layoutComposerRows([{ kind: 'text', text: 'hello\nworld' }], 20, {
      showCursor: false,
    });
    expect(rows.map((r) => r.map((s) => (s.kind === 'chip' ? s.label : s.text)).join(''))).toEqual([
      'hello',
      'world',
    ]);
  });

  it('appends cursor glyph when focused', () => {
    const rows = layoutComposerRows([{ kind: 'text', text: 'hi' }], 40, { showCursor: true });
    expect(rows[rows.length - 1]!.some((s) => s.kind === 'text' && s.text.includes('█'))).toBe(
      true,
    );
  });

  it('does not overflow content budget when wrapping', () => {
    const budget = 20;
    const rows = layoutComposerRows([{ kind: 'text', text: '字'.repeat(30) }], budget, {
      showCursor: false,
    });
    for (const row of rows) {
      const w = row.reduce(
        (a, s) => a + stringWidth(s.kind === 'chip' ? s.label : s.text),
        0,
      );
      expect(w).toBeLessThanOrEqual(budget);
    }
  });
});

describe('buildComposerBox', () => {
  it('renders multi-line body with aligned continuation', () => {
    const { lines, bodyRowCount } = buildComposerBox({
      width: 40,
      input: 'line1\nline2',
      mode: 'ask',
      modelLabel: 'mock',
      focusScrollback: false,
      autocomplete: null,
      maxBodyRows: 8,
    });
    expect(bodyRowCount).toBe(2);
    const plain = linesToPlain(lines);
    expect(plain).toContain(`${COMPOSER_PROMPT}line1`);
    expect(plain).toMatch(/line2/);
    const body = lines.filter((l) => l.some((s) => s.text.startsWith('│')));
    for (const row of body) {
      const plainRow = row.map((s) => s.text).join('');
      expect(plainRow.startsWith('│')).toBe(true);
      expect(plainRow.trimEnd().endsWith('│')).toBe(true);
      expect(stringWidth(plainRow)).toBe(40);
    }
  });

  it('shows paste chip instead of raw multiline', () => {
    const id = 1;
    const blocks = new Map([[id, 'a\nb\nc\nd']]);
    const { lines } = buildComposerBox({
      width: 50,
      input: `note ${makePasteMark(id)}`,
      mode: 'ask',
      modelLabel: 'mock',
      focusScrollback: false,
      autocomplete: null,
      pasteBlocks: blocks,
    });
    const plain = linesToPlain(lines);
    expect(plain).toContain('[Pasted 4 lines]');
    expect(plain).not.toContain('\na\n');
    const chip = lines.flat().find((s) => s.text.includes('Pasted'));
    expect(chip?.bg).toBe('warning');
  });
});
