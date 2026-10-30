import { describe, expect, it } from 'vitest';
import { resolveColorTier, slotToFgOpen } from './resolve.js';

describe('resolveColorTier', () => {
  it('falls back to 16 without caps', () => {
    expect(resolveColorTier(null)).toBe('16');
    expect(resolveColorTier(undefined)).toBe('16');
  });

  it('uses truecolor when capability set', () => {
    expect(resolveColorTier({ truecolor: true })).toBe('truecolor');
  });

  it('uses 256 when caps present without truecolor', () => {
    expect(resolveColorTier({ truecolor: false })).toBe('256');
  });
});

describe('slotToFgOpen', () => {
  it('16-color path emits classic SGR', () => {
    const open = slotToFgOpen('accent', null);
    expect(open).toBe('\x1b[36m');
  });

  it('truecolor path emits 38;2', () => {
    const open = slotToFgOpen('accent', { truecolor: true });
    expect(open).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m$/);
    expect(open).not.toBe('\x1b[36m');
  });

  it('256 path emits 38;5', () => {
    const open = slotToFgOpen('accent', { truecolor: false });
    expect(open).toMatch(/^\x1b\[38;5;\d+m$/);
  });
});
