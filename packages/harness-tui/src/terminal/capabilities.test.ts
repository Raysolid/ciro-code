import { describe, expect, it } from 'vitest';
import { detectCapabilities } from './capabilities.js';

describe('detectCapabilities', () => {
  it('returns positive dimensions', () => {
    const caps = detectCapabilities({
      isTTY: true,
      columns: 100,
      rows: 40,
    } as NodeJS.WriteStream);
    expect(caps.columns).toBe(100);
    expect(caps.rows).toBe(40);
    expect(caps.alternateScreen).toBe(true);
  });

  it('disables alternate screen when CIRO_TUI_MINIMAL=1', () => {
    const prev = process.env.CIRO_TUI_MINIMAL;
    process.env.CIRO_TUI_MINIMAL = '1';
    try {
      const caps = detectCapabilities({
        isTTY: true,
        columns: 80,
        rows: 24,
      } as NodeJS.WriteStream);
      expect(caps.alternateScreen).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CIRO_TUI_MINIMAL;
      else process.env.CIRO_TUI_MINIMAL = prev;
    }
  });
});
