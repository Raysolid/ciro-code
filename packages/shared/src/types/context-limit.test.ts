import { describe, expect, it } from 'vitest';
import { resolveEffectiveContextLimit } from './context-limit.js';

describe('resolveEffectiveContextLimit', () => {
  it('uses apiMaxContext when maxMode on', () => {
    expect(
      resolveEffectiveContextLimit({
        maxMode: true,
        apiMaxContext: 200_000,
        contextLimit: 64_000,
        fallbackLimit: 128_000,
      }),
    ).toBe(200_000);
  });

  it('uses contextLimit when maxMode off', () => {
    expect(
      resolveEffectiveContextLimit({
        maxMode: false,
        apiMaxContext: 200_000,
        contextLimit: 64_000,
        fallbackLimit: 128_000,
      }),
    ).toBe(64_000);
  });

  it('falls back to config when no contextLimit', () => {
    expect(
      resolveEffectiveContextLimit({
        maxMode: true,
        fallbackLimit: 128_000,
      }),
    ).toBe(128_000);
  });
});
